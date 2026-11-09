import mysql, { type Pool } from 'mysql2/promise';
import { databaseUrl } from './env';

// 개발 서버가 코드를 다시 불러와도 연결이 계속 늘어나지 않게 globalThis에 둔다.
const g = globalThis as unknown as { __sajangPool?: Pool };

export function pool(): Pool {
  if (!g.__sajangPool) {
    const p = mysql.createPool({
      uri: databaseUrl(),
      connectionLimit: 10,
      decimalNumbers: true, // DECIMAL을 문자열이 아니라 숫자로 돌려준다.
      dateStrings: true,
      charset: 'utf8mb4',
    });
    // 모든 연결을 UTC + 엄격 모드로 맞춘다(범위를 벗어난 값을 조용히 깎지 않고 오류로 처리).
    p.on('connection', (c) => {
      c.query("SET time_zone = '+00:00', sql_mode = CONCAT_WS(',', @@sql_mode, 'STRICT_ALL_TABLES')");
    });
    g.__sajangPool = p;
  }
  return g.__sajangPool;
}
