export const databaseUrl = () => process.env.DATABASE_URL ?? '';
export const isConfigured = () => Boolean(databaseUrl());
