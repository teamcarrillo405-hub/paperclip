export interface AgentToolContext {
  companyId?: string;
  userId?: string;
}

export interface AgentTool<
  TArgs = Record<string, unknown>,
  TResult = unknown,
> {
  name: string;
  description: string;
  parametersSchema: Record<string, unknown>;
  execute: (args: TArgs, ctx?: AgentToolContext) => Promise<TResult>;
}
