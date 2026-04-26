import { getSSOConfig } from "./sso-config.js";

export async function getSSOLoginHint(): Promise<{
  providers: Array<{ id: string; name: string; loginUrl: string }>;
}> {
  const config = await getSSOConfig();
  const providers = config.providers
    .filter((p) => p.enabled)
    .map((p) => ({
      id: p.id,
      name: p.name,
      loginUrl: `/sso/${p.id}/login`,
    }));

  return { providers };
}
