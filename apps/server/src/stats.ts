import { Router } from 'express';
import { prisma } from './db.js';

export const statsRouter: Router = Router();

statsRouter.get('/users/:id', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  res.json({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarKey: user.avatarKey,
    preferredColor: user.preferredColor,
    wins: user.wins,
    losses: user.losses,
  });
});

statsRouter.get('/users/:id/stats', async (req, res) => {
  const userId = req.params.id;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const myRows = await prisma.gamePlayer.findMany({ where: { userId } });
  const gameIds = myRows.map((r) => r.gameId);

  // Aggregate lifetime totals.
  const totals = {
    games: myRows.length,
    knightsPlayed: 0,
    roadsBuilt: 0,
    settlementsBuilt: 0,
    citiesBuilt: 0,
    devCardsBought: 0,
    resourcesGained: 0,
    robberMoves: 0,
    longestRoadAwards: 0,
    largestArmyAwards: 0,
    bestVP: 0,
    avgVP: 0,
    winRate: 0,
  };
  const diceHistogram: Record<number, number> = {};
  let vpSum = 0;
  for (const r of myRows) {
    totals.knightsPlayed += r.knightsPlayed;
    totals.roadsBuilt += r.roadsBuilt;
    totals.settlementsBuilt += r.settlementsBuilt;
    totals.citiesBuilt += r.citiesBuilt;
    totals.devCardsBought += r.devCardsBought;
    totals.resourcesGained += r.resourcesGained;
    totals.robberMoves += r.robberMoves;
    if (r.hadLongestRoad) totals.longestRoadAwards++;
    if (r.hadLargestArmy) totals.largestArmyAwards++;
    totals.bestVP = Math.max(totals.bestVP, r.finalVP);
    vpSum += r.finalVP;
    const hist = (r.diceHistogramJson ?? {}) as Record<string, number>;
    for (const [k, v] of Object.entries(hist)) {
      diceHistogram[Number(k)] = (diceHistogram[Number(k)] ?? 0) + v;
    }
  }
  totals.avgVP = myRows.length ? Math.round((vpSum / myRows.length) * 10) / 10 : 0;
  const decided = user.wins + user.losses;
  totals.winRate = decided ? Math.round((user.wins / decided) * 100) : 0;

  // Head-to-head records against everyone they've shared a game with.
  const games = await prisma.game.findMany({
    where: { id: { in: gameIds } },
    include: { players: { include: { user: true } } },
  });
  const h2h = new Map<string, { name: string; wins: number; losses: number; games: number }>();
  for (const game of games) {
    for (const gp of game.players) {
      if (gp.userId === userId) continue;
      const rec =
        h2h.get(gp.userId) ?? { name: gp.user.displayName, wins: 0, losses: 0, games: 0 };
      rec.games++;
      if (game.winnerUserId === userId) rec.wins++;
      else if (game.winnerUserId === gp.userId) rec.losses++;
      h2h.set(gp.userId, rec);
    }
  }

  res.json({
    wins: user.wins,
    losses: user.losses,
    totals,
    diceHistogram,
    headToHead: [...h2h.entries()].map(([opponentId, rec]) => ({ opponentId, ...rec })),
  });
});
