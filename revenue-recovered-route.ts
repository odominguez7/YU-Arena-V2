// app/api/revenue/recovered/route.ts
// Real-time Revenue Recovery Tracking

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { broadcastRevenueUpdate } from '@/lib/websocket';
import { validateApiKey } from '@/lib/auth';
import { z } from 'zod';

const prisma = new PrismaClient();

// Validation schema
const revenueEventSchema = z.object({
  agent_id: z.string().min(1),
  spot_id: z.string().min(1),
  revenue_amount: z.number().positive(),
  operator_id: z.string().min(1),
  metadata: z.record(z.any()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate
    const apiKey = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing API key' },
        { status: 401 }
      );
    }

    const agent = await validateApiKey(apiKey);
    if (!agent) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      );
    }

    // 2. Validate request body
    const body = await request.json();
    const validatedData = revenueEventSchema.parse(body);

    // 3. Verify spot exists and is in correct state
    const spot = await prisma.spot.findUnique({
      where: { id: validatedData.spot_id },
    });

    if (!spot) {
      return NextResponse.json(
        { error: 'Spot not found' },
        { status: 404 }
      );
    }

    if (spot.status !== 'CLAIMED' && spot.status !== 'COMPLETED') {
      return NextResponse.json(
        { error: 'Spot must be claimed before revenue can be recorded' },
        { status: 400 }
      );
    }

    // 4. Create revenue event in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create revenue event
      const revenueEvent = await tx.revenueEvent.create({
        data: {
          amount: validatedData.revenue_amount,
          spotId: validatedData.spot_id,
          operatorId: validatedData.operator_id,
          agentId: validatedData.agent_id,
          metadata: validatedData.metadata || {},
        },
      });

      // Update spot status to completed
      await tx.spot.update({
        where: { id: validatedData.spot_id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      // Get total revenue recovered (all time)
      const totalRevenue = await tx.revenueEvent.aggregate({
        _sum: { amount: true },
      });

      // Get today's total revenue
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const todayRevenue = await tx.revenueEvent.aggregate({
        where: {
          timestamp: { gte: today },
        },
        _sum: { amount: true },
      });

      // Update daily metrics
      const dateKey = new Date().toISOString().split('T')[0];
      await tx.dailyMetrics.upsert({
        where: { date: new Date(dateKey) },
        create: {
          date: new Date(dateKey),
          totalRevenueRecovered: validatedData.revenue_amount,
          revenueEventsCount: 1,
          spotsFilled: 1,
        },
        update: {
          totalRevenueRecovered: { increment: validatedData.revenue_amount },
          revenueEventsCount: { increment: 1 },
          spotsFilled: { increment: 1 },
        },
      });

      // Update agent daily performance
      await tx.agentDailyPerformance.upsert({
        where: {
          agentId_date: {
            agentId: validatedData.agent_id,
            date: new Date(dateKey),
          },
        },
        create: {
          agentId: validatedData.agent_id,
          date: new Date(dateKey),
          revenueGenerated: validatedData.revenue_amount,
          spotsHandled: 1,
        },
        update: {
          revenueGenerated: { increment: validatedData.revenue_amount },
          spotsHandled: { increment: 1 },
        },
      });

      // Update operator stats
      await tx.operator.update({
        where: { id: validatedData.operator_id },
        data: {
          totalRevenue: { increment: validatedData.revenue_amount },
          spotsFilled: { increment: 1 },
        },
      });

      // Create activity log
      await tx.activity.create({
        data: {
          agentId: validatedData.agent_id,
          type: 'REVENUE_RECOVERED',
          description: `Recovered $${validatedData.revenue_amount.toFixed(2)} for ${validatedData.operator_id}`,
          metadata: {
            spotId: validatedData.spot_id,
            amount: validatedData.revenue_amount,
            operatorId: validatedData.operator_id,
          },
        },
      });

      return {
        revenueEvent,
        totalRevenue: totalRevenue._sum.amount || 0,
        todayRevenue: todayRevenue._sum.amount || 0,
      };
    });

    // 5. Broadcast real-time update via WebSocket
    try {
      await broadcastRevenueUpdate({
        type: 'REVENUE_RECOVERED',
        amount: validatedData.revenue_amount,
        total_all_time: result.totalRevenue,
        total_today: result.todayRevenue,
        agent_id: validatedData.agent_id,
        agent_name: agent.name,
        spot_id: validatedData.spot_id,
        operator_id: validatedData.operator_id,
        timestamp: new Date().toISOString(),
      });
    } catch (wsError) {
      console.error('WebSocket broadcast failed:', wsError);
      // Don't fail the request if WebSocket fails
    }

    // 6. Return success response
    return NextResponse.json({
      success: true,
      event_id: result.revenueEvent.id,
      amount: validatedData.revenue_amount,
      total_revenue_all_time: result.totalRevenue,
      total_revenue_today: result.todayRevenue,
      message: 'Revenue recorded successfully',
    });

  } catch (error) {
    console.error('Revenue recovery error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve total revenue
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get('period') || 'all'; // all, today, week, month

    let whereClause = {};
    
    if (period === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      whereClause = { timestamp: { gte: today } };
    } else if (period === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      whereClause = { timestamp: { gte: weekAgo } };
    } else if (period === 'month') {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      whereClause = { timestamp: { gte: monthAgo } };
    }

    const [totalRevenue, eventCount, recentEvents] = await Promise.all([
      prisma.revenueEvent.aggregate({
        where: whereClause,
        _sum: { amount: true },
        _avg: { amount: true },
        _count: true,
      }),
      prisma.revenueEvent.count({ where: whereClause }),
      prisma.revenueEvent.findMany({
        where: whereClause,
        take: 10,
        orderBy: { timestamp: 'desc' },
        include: {
          agent: { select: { name: true, type: true } },
        },
      }),
    ]);

    return NextResponse.json({
      period,
      total_revenue: totalRevenue._sum.amount || 0,
      average_revenue: totalRevenue._avg.amount || 0,
      event_count: eventCount,
      recent_events: recentEvents.map(event => ({
        id: event.id,
        amount: event.amount,
        agent: event.agent.name,
        operator_id: event.operatorId,
        timestamp: event.timestamp,
      })),
    });

  } catch (error) {
    console.error('Get revenue error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve revenue data' },
      { status: 500 }
    );
  }
}
