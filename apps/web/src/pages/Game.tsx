import {
  type EdgeId,
  KNIGHT_COST,
  type ProgressCard,
  SHIP_COST,
  type VertexId,
} from '@catan/shared';
import { useMemo, useState } from 'react';
import { Board, type BoardMode } from '../components/Board.js';
import { CitiesKnights } from '../components/CitiesKnights.js';
import {
  BankTradeModal,
  DiscardModal,
  GameOverModal,
  GoldChoiceModal,
  KnightModal,
  MonopolyModal,
  ProgressModal,
  ProposeTradeModal,
  StealModal,
  YearOfPlentyModal,
  labelDev,
} from '../components/Modals.js';
import { DiceTimer, GameLog, Hand, PlayerList } from '../components/Panels.js';
import { Radio } from '../components/Radio.js';
import {
  COSTS,
  canAfford,
  isCK,
  isMyTurn,
  knightNextToRobber,
  landTiles,
  legalCities,
  legalKnightMoves,
  legalKnightSpots,
  legalRoads,
  legalSettlements,
  legalShips,
  me as getMe,
  robberTargets,
} from '../clientActions.js';
import { emitAction } from '../socket.js';
import { useStore } from '../store.js';

type UiMode = BoardMode | 'roadBuilding' | 'progressRoad';
type RobberIntent = 'move' | 'knight' | 'bishop' | 'chase';

export function GameScreen({ onLeave }: { onLeave: () => void }) {
  const view = useStore((s) => s.game)!;
  const timer = useStore((s) => s.timer);
  const [uiMode, setUiMode] = useState<UiMode>('none');
  const [robberIntent, setRobberIntent] = useState<RobberIntent>('move');
  const [pendingRoads, setPendingRoads] = useState<EdgeId[]>([]);
  const [steal, setSteal] = useState<{ hex: string; targets: { id: string; name: string }[] } | null>(
    null,
  );
  const [knightVertex, setKnightVertex] = useState<string | null>(null);
  const [knightMoveFrom, setKnightMoveFrom] = useState<string | null>(null);
  const [chaseFrom, setChaseFrom] = useState<string | null>(null);
  const [progressCard, setProgressCard] = useState<ProgressCard | null>(null);
  const [modal, setModal] = useState<null | 'bank' | 'propose' | 'yop' | 'mono'>(null);

  const me = getMe(view);
  const myTurn = isMyTurn(view);
  const isCurrent = view.order[view.currentPlayerIndex] === view.you;
  const isSetup = view.phase === 'setup';
  const canBuild = (view.phase === 'main' || view.phase === 'specialBuild') && myTurn;
  const robberIntentEffective: RobberIntent = view.phase === 'moveRobber' ? 'move' : robberIntent;

  // Forced modes during setup / robber placement.
  let activeMode: UiMode = uiMode;
  if (myTurn && isSetup) activeMode = view.setupAwaiting === 'road' ? 'road' : 'settlement';
  else if (myTurn && view.phase === 'moveRobber') activeMode = 'robber';

  const boardMode: BoardMode =
    activeMode === 'roadBuilding' || activeMode === 'progressRoad' ? 'road' : activeMode;

  const legalVertices = useMemo(() => {
    if (boardMode === 'settlement') return new Set(legalSettlements(view, isSetup));
    if (boardMode === 'city') return new Set(legalCities(view));
    if (boardMode === 'knight') return new Set(legalKnightSpots(view));
    if (boardMode === 'knightMove' && knightMoveFrom)
      return new Set(legalKnightMoves(view, knightMoveFrom));
    return new Set<VertexId>();
  }, [view, boardMode, isSetup, knightMoveFrom]);

  const legalEdges = useMemo(() => {
    if (boardMode === 'road') return new Set(legalRoads(view, isSetup));
    if (boardMode === 'ship') return new Set(legalShips(view, isSetup));
    return new Set<EdgeId>();
  }, [view, boardMode, isSetup]);

  const seafarers = view.settings.expansions.includes('seafarers');

  const legalTilesSet = useMemo(
    () => (boardMode === 'robber' ? new Set(landTiles(view)) : new Set<string>()),
    [view, boardMode],
  );

  const reset = () => {
    setUiMode('none');
    setPendingRoads([]);
    setKnightMoveFrom(null);
    setChaseFrom(null);
  };

  const onVertex = (v: VertexId) => {
    if (boardMode === 'settlement')
      emitAction(isSetup ? { type: 'placeSettlement', vertex: v } : { type: 'buildSettlement', vertex: v });
    else if (boardMode === 'city') emitAction({ type: 'buildCity', vertex: v });
    else if (boardMode === 'knight') emitAction({ type: 'buildKnight', vertex: v });
    else if (boardMode === 'knightMove' && knightMoveFrom)
      emitAction({ type: 'moveKnight', from: knightMoveFrom, to: v });
    reset();
  };

  const onEdge = (e: EdgeId) => {
    if (activeMode === 'roadBuilding' || activeMode === 'progressRoad') {
      const next = pendingRoads.includes(e) ? pendingRoads : [...pendingRoads, e].slice(0, 2);
      setPendingRoads(next);
      if (next.length === 2) {
        emitAction(
          activeMode === 'progressRoad'
            ? { type: 'playProgress', card: 'roadBuilding', params: { edges: next } }
            : { type: 'playRoadBuilding', edges: next },
        );
        reset();
      }
      return;
    }
    if (boardMode === 'ship') {
      emitAction(isSetup ? { type: 'placeShip', edge: e } : { type: 'buildShip', edge: e });
    } else {
      emitAction(isSetup ? { type: 'placeRoad', edge: e } : { type: 'buildRoad', edge: e });
    }
    reset();
  };

  const onTile = (hex: string) => {
    // Bishop moves the robber and auto-steals from everyone adjacent — no target prompt.
    if (robberIntentEffective === 'bishop') {
      emitAction({ type: 'playProgress', card: 'bishop', params: { hex } });
      reset();
      return;
    }
    const targets = robberTargets(view, hex);
    const fire = (stealFrom: string | null) => {
      if (robberIntentEffective === 'knight') emitAction({ type: 'playKnight', hex, stealFrom });
      else if (robberIntentEffective === 'chase' && chaseFrom)
        emitAction({ type: 'chaseRobber', from: chaseFrom, hex, stealFrom });
      else emitAction({ type: 'moveRobber', hex, stealFrom });
    };
    if (targets.length > 1) {
      setSteal({ hex, targets });
    } else {
      fire(targets[0]?.id ?? null);
      reset();
    }
  };

  const onPlayProgress = (card: ProgressCard) => {
    if (card === 'roadBuilding') {
      setUiMode('progressRoad');
      setPendingRoads([]);
    } else if (card === 'bishop') {
      setUiMode('robber');
      setRobberIntent('bishop');
    } else {
      setProgressCard(card);
    }
  };

  const onMoveKnight = (vertex: string) => {
    setKnightMoveFrom(vertex);
    setUiMode('knightMove');
  };
  const onChaseKnight = (vertex: string) => {
    setChaseFrom(vertex);
    setRobberIntent('chase');
    setUiMode('robber');
  };

  const playDev = (card: string) => {
    if (card === 'knight') {
      setUiMode('robber');
      setRobberIntent('knight');
    } else if (card === 'roadBuilding') {
      setUiMode('roadBuilding');
      setPendingRoads([]);
    } else if (card === 'yearOfPlenty') setModal('yop');
    else if (card === 'monopoly') setModal('mono');
  };

  const myDevCards = [...new Set(me.devCards ?? [])].filter((c) => c !== 'victoryPoint');
  const canPlayDev =
    (view.phase === 'main' || view.phase === 'rollDice') &&
    myTurn &&
    !me.hasPlayedDevCardThisTurn;

  const trade = view.activeTrade;
  const incomingTrade =
    trade && trade.from !== view.you && trade.responses[view.you] === 'pending' ? trade : null;
  const myProposal = trade && trade.from === view.you ? trade : null;

  return (
    <div className="game">
      {/* left: players + log + radio */}
      <div className="sidebar">
        <PlayerList view={view} />
        <GameLog view={view} />
        <Radio />
      </div>

      {/* center: board */}
      <div className="board-wrap">
        <Board
          view={view}
          mode={boardMode}
          legalVertices={legalVertices}
          legalEdges={legalEdges}
          legalTiles={legalTilesSet}
          onVertex={onVertex}
          onEdge={onEdge}
          onTile={onTile}
          onKnight={setKnightVertex}
        />
      </div>

      {/* right: hand + actions */}
      <div className="sidebar">
        <DiceTimer view={view} timer={timer} />
        <Hand view={view} />
        <CitiesKnights view={view} onPlayProgress={onPlayProgress} />

        <div className="actionbar">
          {view.phase === 'rollDice' && isCurrent && !view.hasRolled && (
            <button className="accent" onClick={() => emitAction({ type: 'rollDice' })}>
              🎲 Roll
            </button>
          )}
          {isSetup && myTurn && (
            <span className="muted">
              Place your {view.setupAwaiting === 'road' ? 'road' : 'settlement'}.
            </span>
          )}
          {view.phase === 'moveRobber' && myTurn && <span className="muted">Move the robber.</span>}

          {canBuild && (
            <>
              <button disabled={!canAfford(view, COSTS.road)} onClick={() => setUiMode('road')}>
                Road
              </button>
              {seafarers && (
                <button
                  disabled={!canAfford(view, SHIP_COST) || me.piecesLeft.ship <= 0}
                  onClick={() => setUiMode('ship')}
                >
                  Ship
                </button>
              )}
              <button
                disabled={!canAfford(view, COSTS.settlement)}
                onClick={() => setUiMode('settlement')}
              >
                Settlement
              </button>
              <button disabled={!canAfford(view, COSTS.city)} onClick={() => setUiMode('city')}>
                City
              </button>
              {isCK(view) ? (
                <button
                  disabled={!canAfford(view, KNIGHT_COST) || me.piecesLeft.knight <= 0}
                  onClick={() => setUiMode('knight')}
                >
                  Knight
                </button>
              ) : (
                <button
                  disabled={!canAfford(view, COSTS.devCard) || view.devDeckCount === 0}
                  onClick={() => emitAction({ type: 'buyDevCard' })}
                >
                  Buy dev
                </button>
              )}
              <button onClick={() => setModal('bank')}>Bank trade</button>
              {view.phase === 'main' && (
                <button onClick={() => setModal('propose')}>Propose trade</button>
              )}
            </>
          )}

          {canPlayDev &&
            myDevCards.map((c) => (
              <button key={c} className="ghost" onClick={() => playDev(c)}>
                Play {labelDev(c)}
              </button>
            ))}

          {view.phase === 'main' && isCurrent && view.hasRolled && (
            <button className="accent" onClick={() => emitAction({ type: 'endTurn' })}>
              End turn
            </button>
          )}
          {view.phase === 'specialBuild' && myTurn && (
            <button className="accent" onClick={() => emitAction({ type: 'endSpecialBuild' })}>
              Done building
            </button>
          )}
          {activeMode !== 'none' && !isSetup && view.phase !== 'moveRobber' && (
            <button className="ghost" onClick={reset}>
              Cancel
            </button>
          )}
          {(activeMode === 'roadBuilding' || activeMode === 'progressRoad') && (
            <span className="muted">Pick 2 roads ({pendingRoads.length}/2)</span>
          )}
          {activeMode === 'knightMove' && <span className="muted">Choose where to move the knight.</span>}
        </div>

        {incomingTrade && (
          <div className="card col">
            <strong>Trade offer</strong>
            <span className="muted">A player wants to trade with you.</span>
            <div className="row">
              <button className="accent" onClick={() => emitAction({ type: 'respondTrade', accept: true })}>
                Accept
              </button>
              <button className="ghost" onClick={() => emitAction({ type: 'respondTrade', accept: false })}>
                Decline
              </button>
            </div>
          </div>
        )}

        {myProposal && (
          <div className="card col">
            <strong>Your trade offer</strong>
            {Object.entries(myProposal.responses).map(([pid, r]) => {
              const p = view.players.find((x) => x.id === pid);
              return (
                <div className="row" key={pid}>
                  <span>{p?.name}</span>
                  <span className="spacer" />
                  {r === 'accept' ? (
                    <button onClick={() => emitAction({ type: 'acceptTradeWith', playerId: pid })}>
                      Trade
                    </button>
                  ) : (
                    <span className="muted">{r}</span>
                  )}
                </div>
              );
            })}
            <button className="ghost" onClick={() => emitAction({ type: 'cancelTrade' })}>
              Cancel offer
            </button>
          </div>
        )}
      </div>

      {/* modals */}
      {view.yourPendingDiscard > 0 && <DiscardModal view={view} />}
      {view.yourPendingGold > 0 && <GoldChoiceModal view={view} />}
      {knightVertex && (
        <KnightModal
          view={view}
          vertex={knightVertex}
          canAct={canBuild}
          nearRobber={knightNextToRobber(view, knightVertex)}
          onMove={onMoveKnight}
          onChase={onChaseKnight}
          onClose={() => setKnightVertex(null)}
        />
      )}
      {steal && (
        <StealModal
          targets={steal.targets}
          onPick={(id) => {
            if (robberIntentEffective === 'knight')
              emitAction({ type: 'playKnight', hex: steal.hex, stealFrom: id });
            else if (robberIntentEffective === 'chase' && chaseFrom)
              emitAction({ type: 'chaseRobber', from: chaseFrom, hex: steal.hex, stealFrom: id });
            else emitAction({ type: 'moveRobber', hex: steal.hex, stealFrom: id });
            setSteal(null);
            reset();
          }}
          onCancel={() => setSteal(null)}
        />
      )}
      {progressCard && (
        <ProgressModal view={view} card={progressCard} onClose={() => setProgressCard(null)} />
      )}
      {modal === 'bank' && <BankTradeModal view={view} onClose={() => setModal(null)} />}
      {modal === 'propose' && <ProposeTradeModal view={view} onClose={() => setModal(null)} />}
      {modal === 'yop' && <YearOfPlentyModal onClose={() => setModal(null)} />}
      {modal === 'mono' && <MonopolyModal onClose={() => setModal(null)} />}
      {view.phase === 'gameOver' && <GameOverModal view={view} onLeave={onLeave} />}
    </div>
  );
}
