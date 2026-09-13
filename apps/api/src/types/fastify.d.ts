import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    user?: {
      id: string;
      authType: "jwt" | "api_key";
      apiKeyId?: string;
    };
  }
}
