/**
 * ASCII Knot Parser
 * 
 * Parses ASCII art knot diagrams (blender_knots format) into polyline paths.
 * 
 * CRITICAL: Underpass cells MUST be included in lead.points (with isUnder=true)
 * Otherwise crossings cannot be bound to particles!
 */

// Direction vectors
const DIRS = {
  UP:    { dx: 0, dy: -1, name: 'UP' },
  DOWN:  { dx: 0, dy: 1, name: 'DOWN' },
  LEFT:  { dx: -1, dy: 0, name: 'LEFT' },
  RIGHT: { dx: 1, dy: 0, name: 'RIGHT' },
};

const ARROW_DIRS = {
  '^': DIRS.UP,
  'v': DIRS.DOWN,
  'V': DIRS.DOWN,
  '>': DIRS.RIGHT,
  '<': DIRS.LEFT,
};

// ========== ASCII KNOT TEMPLATES ==========

// Reef Knot - Two ropes, 2 crossings
export const REEF_KNOT_ASCII = `
        +--+
>-------|--+
    |   +----------<
    |   |
    |   +---------->
<-------|--+
        +--+
`.trim();

// Figure 8 knot - Single rope, 2 crossings (based on user's reference image)
export const FIGURE8_ASCII = `
   +--+
   |  |
>-----|---------+
   |  |  |      |
   +--|---------+
      |  |
      +--+-->
`.trim();

// Bowline
export const BOWLINE_ASCII = `
     v
     |
     |
  /-\\|
  \\-/|\\
 /--|||--\\
 |  |||  |
 |  v||  |
 \\---/|  |
     \\---/
`.trim();

// Simple crossing
export const SIMPLE_CROSSING_ASCII = `
      1
      |
      |
>-----+----->
      |
      |
      2
`.trim();

// Overhand
export const OVERHAND_ASCII = `
  +------+
  |      |
>-+------+->
`.trim();

/**
 * Parse ASCII knot into leads and crossings
 */
export function parseASCIIKnot(ascii) {
  const lines = ascii.split('\n');
  const height = lines.length;
  const width = Math.max(...lines.map(l => l.length));
  
  const grid = lines.map(line => line.padEnd(width, ' ').split(''));
  
  console.log('=== ASCII Grid ===');
  grid.forEach((row, y) => console.log(`${String(y).padStart(2)}: ${row.join('')}`));
  
  const endpoints = findEndpoints(grid, width, height);
  console.log('Found endpoints:', endpoints.map(h => `(${h.x},${h.y}) ${h.char} -> ${h.dir.name}`));
  
  const consumed = new Set();
  const occupancy = {};
  const leads = [];
  
  for (let i = 0; i < endpoints.length; i++) {
    const ep = endpoints[i];
    const epKey = `${ep.x},${ep.y}`;
    
    if (consumed.has(epKey)) continue;
    
    const leadIdx = leads.length;
    const result = traceLead(grid, ep, width, height, occupancy, leadIdx);
    
    if (result.points.length >= 2) {
      consumed.add(epKey);
      const lastPt = result.points[result.points.length - 1];
      consumed.add(`${lastPt.x},${lastPt.y}`);
      
      leads.push({
        points: result.points,
        name: ep.name || String(leadIdx),
      });
      console.log(`Lead ${leadIdx}: ${result.points.length} points, underpasses: ${result.underpassCount}`);
    }
  }
  
  const crossings = buildCrossings(occupancy);
  console.log('Crossings:', crossings.map(c => 
    `(${c.x},${c.y}) over:${c.overLeadIdx} under:${c.underLeadIdx}`
  ));
  
  return { leads, crossings, width, height };
}

function findEndpoints(grid, width, height) {
  const endpoints = [];
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = grid[y][x];
      
      if (ch in ARROW_DIRS) {
        const dir = ARROW_DIRS[ch];
        const behindCh = getChar(grid, x - dir.dx, y - dir.dy, width, height);
        
        if (!isLineChar(behindCh) && !isCornerChar(behindCh)) {
          endpoints.push({ x, y, dir, name: '', char: ch, isHead: true });
        }
      }
      
      if (/^[0-9]$/.test(ch)) {
        const neighbors = getNeighborLineChars(grid, x, y, width, height);
        if (neighbors.length === 1) {
          const n = neighbors[0];
          const dirObj = getDirFromDelta(n.x - x, n.y - y);
          if (dirObj) {
            endpoints.push({ x, y, dir: dirObj, name: ch, char: ch, isHead: true });
          }
        }
      }
    }
  }
  
  return endpoints;
}

function getDirFromDelta(dx, dy) {
  for (const dir of Object.values(DIRS)) {
    if (dir.dx === dx && dir.dy === dy) return dir;
  }
  return null;
}

function getChar(grid, x, y, width, height) {
  if (x < 0 || x >= width || y < 0 || y >= height) return ' ';
  return grid[y]?.[x] || ' ';
}

function isLineChar(ch) {
  return ch === '-' || ch === '|';
}

function isCornerChar(ch) {
  return ch === '+' || ch === '/' || ch === '\\';
}

function getNeighborLineChars(grid, x, y, width, height) {
  const neighbors = [];
  for (const dir of Object.values(DIRS)) {
    const nx = x + dir.dx;
    const ny = y + dir.dy;
    const ch = getChar(grid, nx, ny, width, height);
    if (isLineChar(ch) || isCornerChar(ch)) {
      neighbors.push({ x: nx, y: ny, ch, dir });
    }
  }
  return neighbors;
}

function isPerpendicularBlock(ch, dir) {
  if (dir.dx !== 0 && ch === '|') return true;
  if (dir.dy !== 0 && ch === '-') return true;
  return false;
}

/**
 * Trace a lead from endpoint to endpoint
 * CRITICAL: underpass cells MUST be added to points with isUnder=true
 */
function traceLead(grid, start, width, height, occupancy, leadIdx) {
  // IMPORTANT: Every point has isUnder flag
  const points = [{ x: start.x, y: start.y, isUnder: false }];
  
  let x = start.x;
  let y = start.y;
  let dir = start.dir;
  let underpassCount = 0;
  let pointIndex = 0;
  
  const maxSteps = width * height * 4;
  let steps = 0;
  
  recordOccupancy(occupancy, x, y, leadIdx, false, pointIndex);
  
  while (steps++ < maxSteps) {
    const nx = x + dir.dx;
    const ny = y + dir.dy;
    const ch = getChar(grid, nx, ny, width, height);
    
    if (isTailChar(ch, dir)) {
      pointIndex++;
      points.push({ x: nx, y: ny, isUnder: false });
      recordOccupancy(occupancy, nx, ny, leadIdx, false, pointIndex);
      break;
    }
    
    if (ch === ' ' || isPerpendicularBlock(ch, dir)) {
      const underpass = findUnderpass(grid, x, y, dir, width, height);
      
      if (underpass) {
        // CRITICAL FIX: Add EVERY underpass cell to points with isUnder=true
        // This is required for crossing detection to work!
        for (const cell of underpass.cells) {
          pointIndex++;
          points.push({ x: cell.x, y: cell.y, isUnder: true });
          recordOccupancy(occupancy, cell.x, cell.y, leadIdx, true, pointIndex);
        }
        
        // End of underpass - back to surface
        pointIndex++;
        points.push({ x: underpass.endX, y: underpass.endY, isUnder: false });
        recordOccupancy(occupancy, underpass.endX, underpass.endY, leadIdx, false, pointIndex);
        
        x = underpass.endX;
        y = underpass.endY;
        underpassCount++;
        continue;
      }
      
      console.log(`  Tracing ended: no underpass at (${nx},${ny}) char='${ch}' dir=${dir.name}`);
      break;
    }
    
    const result = processChar(ch, dir, grid, nx, ny, width, height);
    if (!result) {
      console.log(`  Cannot process char '${ch}' at (${nx},${ny}) with dir ${dir.name}`);
      break;
    }
    
    pointIndex++;
    points.push({ x: nx, y: ny, isUnder: false });
    recordOccupancy(occupancy, nx, ny, leadIdx, false, pointIndex);
    
    x = nx;
    y = ny;
    dir = result.newDir;
  }
  
  return { points, underpassCount };
}

function recordOccupancy(occupancy, x, y, leadIdx, isUnder, pointIndex) {
  const key = `${x},${y}`;
  if (!occupancy[key]) occupancy[key] = [];
  occupancy[key].push({ leadIdx, isUnder, pointIndex });
}

function isTailChar(ch, incomingDir) {
  if (ch === '.') return true;
  if (ch in ARROW_DIRS) {
    const arrowDir = ARROW_DIRS[ch];
    return arrowDir.dx === incomingDir.dx && arrowDir.dy === incomingDir.dy;
  }
  return false;
}

function findUnderpass(grid, x, y, dir, width, height) {
  const cells = [];
  let cx = x + dir.dx;
  let cy = y + dir.dy;
  
  while (cx >= 0 && cx < width && cy >= 0 && cy < height) {
    const ch = getChar(grid, cx, cy, width, height);
    
    if (ch === ' ' || isPerpendicularBlock(ch, dir)) {
      cells.push({ x: cx, y: cy });
      cx += dir.dx;
      cy += dir.dy;
      continue;
    }
    
    if (cells.length > 0 && canContinueOn(ch, dir)) {
      return { cells, endX: cx, endY: cy };
    }
    
    break;
  }
  
  return null;
}

function canContinueOn(ch, dir) {
  if (dir.dx !== 0) {
    return ch === '-' || ch === '+' || ch in ARROW_DIRS || /^[0-9]$/.test(ch);
  }
  if (dir.dy !== 0) {
    return ch === '|' || ch === '+' || ch in ARROW_DIRS || /^[0-9]$/.test(ch);
  }
  return false;
}

function processChar(ch, dir, grid, x, y, width, height) {
  switch (ch) {
    case '-':
      if (dir.dy === 0) return { newDir: dir };
      return null;
      
    case '|':
      if (dir.dx === 0) return { newDir: dir };
      return null;
      
    case '+':
      return findCornerExitPreferStraight(grid, x, y, dir, width, height);
      
    case '/':
      if (dir.dx === 1) return { newDir: DIRS.UP };
      if (dir.dx === -1) return { newDir: DIRS.DOWN };
      if (dir.dy === 1) return { newDir: DIRS.LEFT };
      if (dir.dy === -1) return { newDir: DIRS.RIGHT };
      return null;
      
    case '\\':
      if (dir.dx === 1) return { newDir: DIRS.DOWN };
      if (dir.dx === -1) return { newDir: DIRS.UP };
      if (dir.dy === 1) return { newDir: DIRS.RIGHT };
      if (dir.dy === -1) return { newDir: DIRS.LEFT };
      return null;
  }
  
  if (ch in ARROW_DIRS || /^[0-9]$/.test(ch)) {
    return { newDir: dir };
  }
  
  return null;
}

function findCornerExitPreferStraight(grid, x, y, dir, width, height) {
  const straightCh = getChar(grid, x + dir.dx, y + dir.dy, width, height);
  if (canContinueOn(straightCh, dir)) {
    return { newDir: dir };
  }
  
  const turns = (dir.dx !== 0) ? [DIRS.UP, DIRS.DOWN] : [DIRS.LEFT, DIRS.RIGHT];
  for (const turnDir of turns) {
    const tch = getChar(grid, x + turnDir.dx, y + turnDir.dy, width, height);
    if (canContinueOn(tch, turnDir)) {
      return { newDir: turnDir };
    }
  }
  
  for (const d of Object.values(DIRS)) {
    if (d.dx === -dir.dx && d.dy === -dir.dy) continue;
    const nch = getChar(grid, x + d.dx, y + d.dy, width, height);
    if (canContinueOn(nch, d)) {
      return { newDir: d };
    }
  }
  
  return null;
}

function buildCrossings(occupancy) {
  const crossings = [];
  
  for (const [key, entries] of Object.entries(occupancy)) {
    const underEntries = entries.filter(e => e.isUnder);
    const overEntries = entries.filter(e => !e.isUnder);
    
    if (underEntries.length > 0 && overEntries.length > 0) {
      const [xStr, yStr] = key.split(',');
      const x = parseInt(xStr);
      const y = parseInt(yStr);
      
      for (const under of underEntries) {
        for (const over of overEntries) {
          const isDifferentLead = under.leadIdx !== over.leadIdx;
          const isSelfCrossing = under.leadIdx === over.leadIdx && 
                                  Math.abs(under.pointIndex - over.pointIndex) > 2;
          
          if (isDifferentLead || isSelfCrossing) {
            const exists = crossings.some(c => 
              c.x === x && c.y === y && 
              c.overLeadIdx === over.leadIdx && 
              c.underLeadIdx === under.leadIdx
            );
            if (!exists) {
              crossings.push({
                x, y,
                overLeadIdx: over.leadIdx,
                underLeadIdx: under.leadIdx,
                overPointIdx: over.pointIndex,
                underPointIdx: under.pointIndex,
              });
            }
          }
        }
      }
    }
  }
  
  return crossings;
}

/**
 * Convert parsed ASCII to 3D knot
 * CRITICAL: isUnder points get z = -zSeparation by default
 */
export function asciiToKnot3D(parsed, options = {}) {
  const {
    scale = 0.25,
    zSeparation = 0.2,
  } = options;
  
  const crossingMap = new Map();
  for (const c of parsed.crossings) {
    const key = `${c.x},${c.y}`;
    if (!crossingMap.has(key)) crossingMap.set(key, []);
    crossingMap.get(key).push(c);
  }
  
  const knot = {
    leads: [],
    crossings: [],
  };
  
  for (let leadIdx = 0; leadIdx < parsed.leads.length; leadIdx++) {
    const lead = parsed.leads[leadIdx];
    const points3D = [];
    
    for (const pt of lead.points) {
      // CRITICAL FIX: isUnder points default to -zSeparation
      let z = pt.isUnder ? -zSeparation : 0;
      
      const key = `${pt.x},${pt.y}`;
      const crossingsHere = crossingMap.get(key) || [];
      
      for (const c of crossingsHere) {
        if (c.overLeadIdx === leadIdx) z = zSeparation;
        else if (c.underLeadIdx === leadIdx) z = -zSeparation;
      }
      
      points3D.push({
        x: pt.x * scale,
        y: -pt.y * scale,
        z,
        gridX: pt.x,
        gridY: pt.y,
        isUnder: pt.isUnder,
      });
    }
    
    knot.leads.push({
      name: lead.name,
      points: points3D,
    });
  }
  
  for (const c of parsed.crossings) {
    knot.crossings.push({
      gridX: c.x,
      gridY: c.y,
      x: c.x * scale,
      y: -c.y * scale,
      overLeadIdx: c.overLeadIdx,
      underLeadIdx: c.underLeadIdx,
    });
  }
  
  return knot;
}
