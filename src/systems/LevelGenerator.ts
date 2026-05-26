interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface BSPNode {
  x: number;
  y: number;
  w: number;
  h: number;
  room?: Room;
  left?: BSPNode;
  right?: BSPNode;
}

export interface LevelData {
  grid: number[][];
  gridW: number;
  gridH: number;
  playerPos: { x: number; y: number };
  exitPos: { x: number; y: number };
  enemyPositions: { x: number; y: number }[];
  pickupPositions: { x: number; y: number }[];
}

export class LevelGenerator {
  private grid: number[][] = [];
  private rooms: Room[] = [];

  generate(gridW: number, gridH: number, pickupCount: number, enemyCount: number): LevelData {
    this.rooms = [];
    // Fill with walls
    this.grid = Array.from({ length: gridH }, () => new Array(gridW).fill(1));

    const root: BSPNode = { x: 1, y: 1, w: gridW - 2, h: gridH - 2 };
    this.splitNode(root, 5);
    this.collectRooms(root);

    for (const room of this.rooms) {
      this.carveRoom(room);
    }

    for (let i = 1; i < this.rooms.length; i++) {
      this.connect(this.rooms[i - 1], this.rooms[i]);
    }

    // Collect floor tiles
    const floor: { x: number; y: number }[] = [];
    for (let y = 0; y < gridH; y++) {
      for (let x = 0; x < gridW; x++) {
        if (this.grid[y][x] === 0) floor.push({ x, y });
      }
    }

    // Shuffle
    for (let i = floor.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [floor[i], floor[j]] = [floor[j], floor[i]];
    }

    const playerPos = floor[0];
    const exitPos = floor[Math.floor(floor.length * 0.85)] ?? floor[floor.length - 1];

    // Enemy positions: avoid first 20% of shuffled array (near player)
    const enemyStart = Math.floor(floor.length * 0.2);
    const enemyEnd = Math.min(enemyStart + enemyCount, Math.floor(floor.length * 0.7));
    const enemyPositions = floor.slice(enemyStart, enemyEnd);

    const pickupStart = Math.floor(floor.length * 0.7);
    const pickupEnd = Math.min(pickupStart + pickupCount, floor.length - 1);
    const pickupPositions = floor.slice(pickupStart, pickupEnd);

    return { grid: this.grid, gridW, gridH, playerPos, exitPos, enemyPositions, pickupPositions };
  }

  private splitNode(node: BSPNode, minSize: number): void {
    if (node.w <= minSize * 2 || node.h <= minSize * 2) {
      node.room = { x: node.x, y: node.y, w: node.w, h: node.h };
      return;
    }

    const splitH = node.h >= node.w;

    if (splitH) {
      const split = minSize + Math.floor(Math.random() * (node.h - minSize * 2));
      node.left = { x: node.x, y: node.y, w: node.w, h: split };
      node.right = { x: node.x, y: node.y + split, w: node.w, h: node.h - split };
    } else {
      const split = minSize + Math.floor(Math.random() * (node.w - minSize * 2));
      node.left = { x: node.x, y: node.y, w: split, h: node.h };
      node.right = { x: node.x + split, y: node.y, w: node.w - split, h: node.h };
    }

    this.splitNode(node.left, minSize);
    this.splitNode(node.right, minSize);
  }

  private collectRooms(node: BSPNode): void {
    if (node.room) {
      const margin = 1;
      this.rooms.push({
        x: node.room.x + margin,
        y: node.room.y + margin,
        w: Math.max(3, node.room.w - margin * 2),
        h: Math.max(3, node.room.h - margin * 2),
      });
      return;
    }
    if (node.left) this.collectRooms(node.left);
    if (node.right) this.collectRooms(node.right);
  }

  private carveRoom(room: Room): void {
    const { grid } = this;
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        if (grid[y] && grid[y][x] !== undefined) grid[y][x] = 0;
      }
    }
  }

  private connect(a: Room, b: Room): void {
    const ax = Math.floor(a.x + a.w / 2);
    const ay = Math.floor(a.y + a.h / 2);
    const bx = Math.floor(b.x + b.w / 2);
    const by = Math.floor(b.y + b.h / 2);
    const { grid } = this;
    const H = grid.length;
    const W = grid[0]?.length ?? 0;

    // Horizontal then vertical, 2-tile wide corridors
    const x1 = Math.min(ax, bx);
    const x2 = Math.max(ax, bx);
    for (let x = x1; x <= x2; x++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cy = ay + dy;
        if (cy >= 0 && cy < H) grid[cy][x] = 0;
      }
    }
    const y1 = Math.min(ay, by);
    const y2 = Math.max(ay, by);
    for (let y = y1; y <= y2; y++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = bx + dx;
        if (cx >= 0 && cx < W) grid[y][cx] = 0;
      }
    }
  }
}
