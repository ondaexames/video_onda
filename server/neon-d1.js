import { neon } from "@neondatabase/serverless";

export function postgresSql(source) {
  let index = 0;
  let quoted = false;
  let sql = "";

  for (let cursor = 0; cursor < source.length; cursor += 1) {
    const char = source[cursor];
    if (char === "'" && source[cursor - 1] !== "\\") {
      if (quoted && source[cursor + 1] === "'") {
        sql += "''";
        cursor += 1;
        continue;
      }
      quoted = !quoted;
    }
    if (char === "?" && !quoted) {
      index += 1;
      sql += `$${index}`;
    } else {
      sql += char;
    }
  }

  return sql
    .replace("COALESCE(GROUP_CONCAT(p.name, ', '), '')", "COALESCE(STRING_AGG(p.name, ', ' ORDER BY p.name), '')")
    .replace("GROUP BY c.id ORDER BY c.name COLLATE NOCASE", "GROUP BY c.id, c.name, c.cpf, c.email, c.phone, c.address, c.created_at ORDER BY LOWER(c.name)")
    .replaceAll("ORDER BY name COLLATE NOCASE", "ORDER BY LOWER(name)");
}

function d1Result(result) {
  return {
    success: true,
    results: result.rows,
    meta: { changes: Number(result.rowCount || 0) },
  };
}

class NeonStatement {
  constructor(sqlClient, source, params = []) {
    this.sqlClient = sqlClient;
    this.source = source;
    this.params = params;
  }

  bind(...params) {
    return new NeonStatement(this.sqlClient, this.source, params);
  }

  query(client = this.sqlClient) {
    return client.query(postgresSql(this.source), this.params);
  }

  async first() {
    const result = await this.query();
    return result.rows[0] || null;
  }

  async all() {
    const result = await this.query();
    return d1Result(result);
  }

  async run() {
    return d1Result(await this.query());
  }
}

export function createNeonD1(databaseUrl) {
  if (!databaseUrl) throw new Error("DATABASE_URL não configurada");
  const sqlClient = neon(databaseUrl, { fullResults: true });

  return {
    prepare(source) {
      return new NeonStatement(sqlClient, source);
    },
    async batch(statements) {
      if (!statements.length) return [];
      const results = await sqlClient.transaction(
        (transaction) => statements.map((statement) => statement.query(transaction)),
        { fullResults: true },
      );
      return results.map(d1Result);
    },
  };
}

