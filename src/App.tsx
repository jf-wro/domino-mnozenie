import React, { useState, useRef, useEffect } from 'react';
import './App.css';
import { RotateCw } from 'lucide-react';

// ============================================================
// Multiplication table data
// ============================================================

// Map: product → all factor pairs [a, b] where a×b = product, a,b ∈ [0,9]
const FACTOR_MAP = new Map<number, [number, number][]>();
for (let a = 1; a <= 9; a++) {
  for (let b = 1; b <= 9; b++) {
    const product = a * b;
    if (!FACTOR_MAP.has(product)) FACTOR_MAP.set(product, []);
    FACTOR_MAP.get(product)!.push([a, b]);
  }
}

const ALL_PRODUCTS = [...FACTOR_MAP.keys()];

// ============================================================
// Types
// ============================================================

export type GameMode = 30 | 50 | 100;
export type Theme = 'earth' | 'forest' | 'ocean';

interface HalfData {
  label: string;   // display: "3×7" or "21"
  value: number;   // numeric value
  type: 'expr' | 'result';
}

interface TileData {
  id: string;
  left: HalfData;
  right: HalfData;
  rotation: number;
  x?: number;
  y?: number;
  isOnBoard: boolean;
  connectedTick?: number;
  hasBeenConnected?: boolean;
}

interface BoardSquare {
  x: number;
  y: number;
  half: HalfData;
  tileId: string;
}

// ============================================================
// Tile generation helpers
// ============================================================

const getValidProducts = (mode: GameMode) => ALL_PRODUCTS.filter(p => p <= mode);

const randomExprHalf = (mode: GameMode, targetValue?: number): HalfData => {
  if (targetValue !== undefined && FACTOR_MAP.has(targetValue) && targetValue <= mode) {
    const pairs = FACTOR_MAP.get(targetValue)!.filter(([a,b]) => a * b <= mode);
    if (pairs.length > 0) {
      const [a, b] = pairs[Math.floor(Math.random() * pairs.length)];
      return { label: `${a}×${b}`, value: a * b, type: 'expr' };
    }
  }
  let a, b;
  do {
    a = 1 + Math.floor(Math.random() * 9);
    b = 1 + Math.floor(Math.random() * 9);
  } while (a * b > mode);
  return { label: `${a}×${b}`, value: a * b, type: 'expr' };
};

const randomResultHalf = (mode: GameMode, targetValue?: number): HalfData => {
  if (targetValue !== undefined && targetValue <= mode) {
    return { label: `${targetValue}`, value: targetValue, type: 'result' };
  }
  const products = getValidProducts(mode);
  const product = products[Math.floor(Math.random() * products.length)];
  return { label: `${product}`, value: product, type: 'result' };
};

const generateTile = (mode: GameMode, matchInfo?: { type: 'expr' | 'result'; value: number }): TileData => {
  let left: HalfData;
  let right: HalfData;

  if (matchInfo) {
    let matchHalf: HalfData;
    let otherHalf: HalfData;

    if (matchInfo.type === 'expr') {
      // Exposed half is expression(V) → need result(V) to connect
      matchHalf = randomResultHalf(mode, matchInfo.value);
      otherHalf = randomExprHalf(mode);
    } else {
      // Exposed half is result(V) → need expression(V) to connect
      matchHalf = randomExprHalf(mode, matchInfo.value);
      otherHalf = randomResultHalf(mode);
    }

    if (Math.random() > 0.5) {
      left = matchHalf;
      right = otherHalf;
    } else {
      left = otherHalf;
      right = matchHalf;
    }
  } else {
    left = randomExprHalf(mode);
    right = randomResultHalf(mode);
  }

  return {
    id: Math.random().toString(36).substr(2, 9),
    left,
    right,
    rotation: 0,
    isOnBoard: false,
    hasBeenConnected: false,
  };
};

// ============================================================
// Board analysis
// ============================================================

const computeBoardSquares = (tilesToProcess: TileData[]): BoardSquare[] => {
  const squares: BoardSquare[] = [];
  for (const t of tilesToProcess) {
    if (!t.isOnBoard) continue;
    const rot = (t.rotation % 360 + 360) % 360;
    const rad = (rot * Math.PI) / 180;
    const cx = (t.x || 0) + 112;
    const cy = (t.y || 0) + 56;
    squares.push({
      x: Math.round(cx - 56 * Math.cos(rad)),
      y: Math.round(cy - 56 * Math.sin(rad)),
      half: t.left,
      tileId: t.id,
    });
    squares.push({
      x: Math.round(cx + 56 * Math.cos(rad)),
      y: Math.round(cy + 56 * Math.sin(rad)),
      half: t.right,
      tileId: t.id,
    });
  }
  return squares;
};

const getExposedHalves = (tiles: TileData[]): BoardSquare[] => {
  const connected = tiles.filter(t => t.isOnBoard && t.hasBeenConnected);
  const squares = computeBoardSquares(connected);
  const exposed: BoardSquare[] = [];

  for (const sq of squares) {
    let hasNeighbor = false;
    for (const other of squares) {
      if (sq.tileId === other.tileId) continue;
      const dist = Math.abs(sq.x - other.x) + Math.abs(sq.y - other.y);
      if (dist > 100 && dist < 120) {
        hasNeighbor = true;
        break;
      }
    }
    if (!hasNeighbor) {
      exposed.push(sq);
    }
  }

  return exposed;
};

// Two halves match if: different types (expr↔result) AND same numeric value
const halvesMatch = (a: HalfData, b: HalfData): boolean => {
  return a.type !== b.type && a.value === b.value;
};

// Check if a palette tile can match any exposed board half
const tileCanMatch = (tile: TileData, exposedHalves: BoardSquare[]): boolean => {
  for (const sq of exposedHalves) {
    if (halvesMatch(tile.left, sq.half) || halvesMatch(tile.right, sq.half)) {
      return true;
    }
  }
  return false;
};

// ============================================================
// App Component
// ============================================================

function App() {
  const [gameMode, setGameMode] = useState<GameMode>(100);
  const [theme, setTheme] = useState<Theme>('earth');
  const modeRef = useRef<GameMode>(100);
  const [tiles, setTiles] = useState<TileData[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [glowId, setGlowId] = useState<string | null>(null);
  const [boardOffset, setBoardOffset] = useState({ x: 0, y: 0 });
  const [boardZoom, setBoardZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);

  const dragInfo = useRef({
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0,
    originWasBoard: false,
  });

  const boardRef = useRef<HTMLDivElement>(null);

  // ----------------------------------------------------------
  // Ensure at least 1 palette tile matches an exposed board half
  // ----------------------------------------------------------
  useEffect(() => {
    const boardTiles = tiles.filter(t => t.isOnBoard && t.hasBeenConnected);
    const paletteTiles = tiles.filter(t => !t.isOnBoard);
    if (boardTiles.length === 0 || paletteTiles.length === 0) return;

    const exposed = getExposedHalves(tiles);
    if (exposed.length === 0) return;

    const hasMatch = paletteTiles.some(pt => tileCanMatch(pt, exposed));
    if (!hasMatch) {
      setTiles(prev => {
        const updated = [...prev];
        const pIndex = updated.findIndex(t => !t.isOnBoard);
        if (pIndex !== -1) {
          const exposedNow = getExposedHalves(updated);
          if (exposedNow.length > 0) {
            const target = exposedNow[Math.floor(Math.random() * exposedNow.length)];
            updated[pIndex] = generateTile(modeRef.current, { type: target.half.type, value: target.half.value });
          }
        }
        return updated;
      });
    }
  }, [tiles]);

  // ----------------------------------------------------------
  // Screen scaling (1728px = 16" MacBook reference width)
  // ----------------------------------------------------------
  useEffect(() => {
    const handleResize = () => {
      const scale = Math.min(1, window.innerWidth / 1728);
      document.documentElement.style.setProperty('--app-scale', scale.toString());
      (window as any).__appScale = scale;
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ----------------------------------------------------------
  // Wheel zoom on board
  // ----------------------------------------------------------
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const scaleStr = document.documentElement.style.getPropertyValue('--app-scale') || '1';
      const appScale = parseFloat(scaleStr);
      const rect = el.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left) / appScale;
      const mouseY = (e.clientY - rect.top) / appScale;

      setBoardZoom(prevZoom => {
        const zoomFactor = Math.exp(-e.deltaY * 0.005);
        const newZoom = Math.max(0.3, Math.min(prevZoom * zoomFactor, 2.5));
        setBoardOffset(prevOffset => {
          const Wx = (mouseX - prevOffset.x) / prevZoom;
          const Wy = (mouseY - prevOffset.y) / prevZoom;
          return { x: mouseX - Wx * newZoom, y: mouseY - Wy * newZoom };
        });
        return newZoom;
      });
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const startNewGame = (mode: GameMode = modeRef.current) => {
    setGameMode(mode);
    modeRef.current = mode;

    const starterTile = generateTile(mode);
    starterTile.isOnBoard = true;
    starterTile.x = Math.round((window.innerWidth / 2 - 112) / 56) * 56;
    starterTile.y = Math.round(Math.max(100, window.innerHeight / 3 - 56) / 56) * 56;
    starterTile.connectedTick = Date.now();
    starterTile.hasBeenConnected = true;

    const initialTiles: TileData[] = [starterTile];

    // Generate 10 palette tiles, 4 with guaranteed matches
    for (let i = 0; i < 10; i++) {
      if (i < 4) {
        // Pick a random half from the starter to guarantee a match
        const targetHalf = Math.random() > 0.5 ? starterTile.left : starterTile.right;
        initialTiles.push(generateTile(mode, { type: targetHalf.type, value: targetHalf.value }));
      } else {
        initialTiles.push(generateTile(mode));
      }
    }

    setTiles(initialTiles);
    setBoardOffset({ x: 0, y: 0 });
    setBoardZoom(1);
  };

  // ----------------------------------------------------------
  // Initialize game
  // ----------------------------------------------------------
  useEffect(() => {
    startNewGame(100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.body.className = `theme-${theme}`;
  }, [theme]);

  // ----------------------------------------------------------
  // Board panning
  // ----------------------------------------------------------
  const handlePointerDownBoard = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.tile')) return;
    if (e.button !== 0) return;
    const scale = (window as any).__appScale || 1;
    setIsPanning(true);
    dragInfo.current = {
      startX: e.clientX / scale,
      startY: e.clientY / scale,
      initialX: boardOffset.x,
      initialY: boardOffset.y,
      originWasBoard: false,
    };
  };

  // ----------------------------------------------------------
  // Tile dragging
  // ----------------------------------------------------------
  const handlePointerDownTile = (e: React.PointerEvent, id: string, isOnBoard: boolean) => {
    const tile = tiles.find(t => t.id === id);
    if (!tile) return;
    if (tile.hasBeenConnected) return;

    e.preventDefault();
    e.stopPropagation();
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.rotate-btn')) return;

    setDraggingId(id);

    let initX = tile.x || 0;
    let initY = tile.y || 0;

    if (!isOnBoard && boardRef.current) {
      const scale = (window as any).__appScale || 1;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const boardRect = boardRef.current.getBoundingClientRect();
      initX = ((rect.left - boardRect.left) / scale - boardOffset.x) / boardZoom;
      initY = ((rect.top - boardRect.top) / scale - boardOffset.y) / boardZoom;

      setTiles(prev => prev.map(t =>
        t.id === id ? { ...t, isOnBoard: true, x: initX, y: initY } : t
      ));
    }

    const scale = (window as any).__appScale || 1;
    dragInfo.current = {
      startX: (e.clientX / scale) / boardZoom,
      startY: (e.clientY / scale) / boardZoom,
      initialX: initX,
      initialY: initY,
      originWasBoard: isOnBoard,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const scale = (window as any).__appScale || 1;

    if (isPanning) {
      const dx = e.clientX / scale - dragInfo.current.startX;
      const dy = e.clientY / scale - dragInfo.current.startY;
      setBoardOffset({
        x: dragInfo.current.initialX + dx,
        y: dragInfo.current.initialY + dy,
      });
      return;
    }

    if (!draggingId) return;

    const dx = (e.clientX / scale) / boardZoom - dragInfo.current.startX;
    const dy = (e.clientY / scale) / boardZoom - dragInfo.current.startY;

    setTiles(prev => prev.map(t => {
      if (t.id === draggingId) {
        return { ...t, x: dragInfo.current.initialX + dx, y: dragInfo.current.initialY + dy };
      }
      return t;
    }));
  };

  // ----------------------------------------------------------
  // Drop logic — matching & connection
  // ----------------------------------------------------------
  const handlePointerUp = (e: React.PointerEvent) => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (draggingId) {
      const draggedTile = tiles.find(t => t.id === draggingId);

      if (draggedTile && draggedTile.isOnBoard) {
        const palette = document.querySelector('.palette-container');
        const isOverPalette = palette && e.clientY > palette.getBoundingClientRect().top;

        const snappedX = Math.round((draggedTile.x || 0) / 56) * 56;
        const snappedY = Math.round((draggedTile.y || 0) / 56) * 56;

        const otherTiles = tiles.filter(t => t.isOnBoard && t.id !== draggingId);
        const allBoardSquares = computeBoardSquares(otherTiles);

        // Compute dragged tile squares at snapped position
        const rot = (draggedTile.rotation % 360 + 360) % 360;
        const rad = (rot * Math.PI) / 180;
        const cx = snappedX + 112;
        const cy = snappedY + 56;
        const draggedSquares = [
          {
            x: Math.round(cx - 56 * Math.cos(rad)),
            y: Math.round(cy - 56 * Math.sin(rad)),
            half: draggedTile.left,
          },
          {
            x: Math.round(cx + 56 * Math.cos(rad)),
            y: Math.round(cy + 56 * Math.sin(rad)),
            half: draggedTile.right,
          },
        ];

        let isOverlapping = false;
        let validConnections = 0;
        let invalidConnections = 0;

        for (const Asq of draggedSquares) {
          for (const Bsq of allBoardSquares) {
            const dist = Math.abs(Asq.x - Bsq.x) + Math.abs(Asq.y - Bsq.y);

            if (dist < 10) {
              isOverlapping = true;
            } else if (dist > 100 && dist < 120) {
              // Adjacent — check matching
              if (!halvesMatch(Asq.half, Bsq.half)) {
                invalidConnections++;
              } else {
                // Check if board square is already taken (has a neighbor from another tile)
                let bSqIsTaken = false;
                for (const Csq of allBoardSquares) {
                  if (Csq.tileId === Bsq.tileId) continue;
                  const cDist = Math.abs(Bsq.x - Csq.x) + Math.abs(Bsq.y - Csq.y);
                  if (cDist > 100 && cDist < 120) {
                    bSqIsTaken = true;
                    break;
                  }
                }
                if (bSqIsTaken) {
                  invalidConnections++;
                } else {
                  validConnections++;
                }
              }
            }
          }
        }

        let isValid = !isOverlapping && invalidConnections === 0 && !isOverPalette;
        let hasNeighbor = validConnections > 0;

        if (otherTiles.length === 0 && !isOverPalette && invalidConnections === 0) {
          isValid = true;
          hasNeighbor = true;
        }

        if (isValid && hasNeighbor) {
          // ACCEPT CONNECTION
          setGlowId(draggingId);
          setTimeout(() => setGlowId(null), 600);

          setTiles(prev => {
            let updated = prev.map(t =>
              t.id === draggingId
                ? { ...t, x: snappedX, y: snappedY, connectedTick: Date.now(), hasBeenConnected: true }
                : t
            );

            // Replenish palette with a new tile (preferably matching)
            if (!draggedTile.hasBeenConnected) {
              const exposed = getExposedHalves(updated);
              if (exposed.length > 0) {
                const target = exposed[Math.floor(Math.random() * exposed.length)];
                const newTile = generateTile(modeRef.current, { type: target.half.type, value: target.half.value });
                updated = [...updated, newTile];
              } else {
                updated = [...updated, generateTile(modeRef.current)];
              }
            }
            return updated;
          });
        } else if (isValid && !hasNeighbor) {
          // FREE PLACEMENT (no connection, just dropped freely)
          setTiles(prev => prev.map(t =>
            t.id === draggingId ? { ...t, x: snappedX, y: snappedY } : t
          ));
        } else {
          // REJECT (overlap, mismatch, or over palette)
          setTiles(prev => prev.map(t => {
            if (t.id === draggingId) {
              if (isOverPalette && !t.hasBeenConnected) {
                return { ...t, isOnBoard: false, x: undefined, y: undefined };
              } else if (dragInfo.current.originWasBoard) {
                return { ...t, x: dragInfo.current.initialX, y: dragInfo.current.initialY };
              } else {
                return { ...t, isOnBoard: false, x: undefined, y: undefined };
              }
            }
            return t;
          }));
        }
      }
      setDraggingId(null);
    }
  };

  // ----------------------------------------------------------
  // Double-click tile → return to palette
  // ----------------------------------------------------------
  const handleDoubleClickTile = (id: string, hasBeenConnected: boolean) => {
    if (!hasBeenConnected) {
      setTiles(prev => prev.map(t =>
        t.id === id ? { ...t, isOnBoard: false, x: undefined, y: undefined } : t
      ));
    }
  };

  // ----------------------------------------------------------
  // Rotate tile
  // ----------------------------------------------------------
  const rotateTile = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTiles(prev => prev.map(t => {
      if (t.id === id) {
        return { ...t, rotation: t.rotation + 90 };
      }
      return t;
    }));
  };

  // ----------------------------------------------------------
  // Refresh palette
  // ----------------------------------------------------------
  const refreshPalette = () => {
    const onBoardTiles = tiles.filter(t => t.isOnBoard);
    const exposed = getExposedHalves(tiles);
    const newPaletteTiles: TileData[] = [];

    for (let i = 0; i < 10; i++) {
      if (i < 5 && exposed.length > 0) {
        const target = exposed[Math.floor(Math.random() * exposed.length)];
        newPaletteTiles.push(generateTile(modeRef.current, { type: target.half.type, value: target.half.value }));
      } else {
        newPaletteTiles.push(generateTile(modeRef.current));
      }
    }

    setTiles([...onBoardTiles, ...newPaletteTiles]);
  };

  // ----------------------------------------------------------
  // Render helper for tile halves
  // rotation = tile's current rotation in degrees; text is counter-rotated to stay horizontal
  // ----------------------------------------------------------
  const renderHalf = (half: HalfData, side: 'left' | 'right', rotation = 0) => (
    <div className={`tile-part ${side} tile-half-${half.type}`}>
      <span
        className={half.type === 'expr' ? 'expr-text' : 'result-text'}
        style={{ display: 'inline-block', transform: `rotate(${-rotation}deg)`, transition: 'transform 0.15s' }}
      >
        {half.label}
      </span>
    </div>
  );

  // ----------------------------------------------------------
  // RENDER
  // ----------------------------------------------------------
  return (
    <div
      className="app-container"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <div className="header">
        <div className="logo-area">
          {/* mini domino tile as logo */}
          <div className="logo-domino">
            <div className="logo-pip"><span /></div>
            <div className="logo-pip"><span /></div>
          </div>
          <div className="title-wrapper-vertical">
            <h1 className="title">
              Domino <span>Mnożenie</span> z Dzieszkoła.pl
            </h1>
            <a
              className="ad-link"
              href="https://mnozenie.dzieszkola.pl"
              target="_blank"
              rel="noopener noreferrer"
            >
              mnozenie.dzieszkola.pl ↗
            </a>
          </div>
        </div>
        <div className="header-actions">
          <div className="theme-selector">
            <button className={`theme-btn earth ${theme === 'earth' ? 'active' : ''}`} onClick={() => setTheme('earth')} title="Ziemia" />
            <button className={`theme-btn forest ${theme === 'forest' ? 'active' : ''}`} onClick={() => setTheme('forest')} title="Las" />
            <button className={`theme-btn ocean ${theme === 'ocean' ? 'active' : ''}`} onClick={() => setTheme('ocean')} title="Ocean" />
          </div>
          <div className="mode-selector">
            <button className={`mode-btn ${gameMode === 30 ? 'active' : ''}`} onClick={() => startNewGame(30)}>do 30</button>
            <button className={`mode-btn ${gameMode === 50 ? 'active' : ''}`} onClick={() => startNewGame(50)}>do 50</button>
            <button className={`mode-btn ${gameMode === 100 ? 'active' : ''}`} onClick={() => startNewGame(100)}>do 100</button>
          </div>
          <button className="header-btn" onClick={refreshPalette}>
            Wymień kostki
          </button>
          <button
            className="header-btn primary"
            onClick={() => startNewGame()}
          >
            Nowa gra
          </button>
        </div>
      </div>

      {/* BOARD AREA */}
      <div
        className="board-area"
        ref={boardRef}
        onPointerDown={handlePointerDownBoard}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest('.tile')) return;
          setBoardZoom(1);
          setBoardOffset({ x: 0, y: 0 });
        }}
        style={{
          cursor: isPanning ? 'grabbing' : 'grab',
          backgroundPosition: `${boardOffset.x}px ${boardOffset.y}px`,
          backgroundSize: `${56 * boardZoom}px ${56 * boardZoom}px`,
        }}
      >
        <div
          style={{
            transform: `translate(${boardOffset.x}px, ${boardOffset.y}px) scale(${boardZoom})`,
            transformOrigin: '0 0',
            width: '100%',
            height: '100%',
            position: 'absolute',
            pointerEvents: 'none',
          }}
        >
          {tiles.filter(t => t.isOnBoard).map(tile => {
            let classes = `tile on-board`;
            if (draggingId === tile.id) classes += ' is-dragging';
            if (glowId === tile.id) classes += ' glow-success';

            return (
              <div
                key={tile.id}
                className={classes}
                style={{
                  left: tile.x,
                  top: tile.y,
                  transform: `rotate(${tile.rotation}deg) ${draggingId === tile.id ? 'scale(1.05)' : ''}`,
                  zIndex: draggingId === tile.id ? 100 : 10,
                }}
                onPointerDown={(e) => handlePointerDownTile(e, tile.id, true)}
                onDoubleClick={() => handleDoubleClickTile(tile.id, !!tile.hasBeenConnected)}
              >
                {/* tile-body holds the visual clipping; rotate-btn lives OUTSIDE it */}
                <div className="tile-body">
                  {renderHalf(tile.left, 'left', tile.rotation)}
                  {renderHalf(tile.right, 'right', tile.rotation)}
                </div>

                {!draggingId && !tile.hasBeenConnected && (
                  <button
                    className="rotate-btn"
                    onClick={(e) => rotateTile(tile.id, e)}
                    style={{ transform: `rotate(${-tile.rotation}deg)` }}
                  >
                    <RotateCw size={24} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* PALETTE */}
      <div className="palette-container">
        <div className="palette-glass glass">
          {tiles.filter(t => !t.isOnBoard).map(tile => (
            <div key={tile.id} className="tile-wrapper">
              <div
                className={`tile ${draggingId === tile.id ? 'is-dragging' : ''}`}
                onPointerDown={(e) => handlePointerDownTile(e, tile.id, false)}
                style={{ transform: draggingId === tile.id ? 'scale(1.05)' : 'none' }}
              >
                <div className="tile-body">
                  {renderHalf(tile.left, 'left')}
                  {renderHalf(tile.right, 'right')}
                </div>
                {!draggingId && (
                  <button
                    className="rotate-btn"
                    onClick={(e) => rotateTile(tile.id, e)}
                  >
                    <RotateCw size={20} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
