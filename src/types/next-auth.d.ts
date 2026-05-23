import "next-auth";

declare module "next-auth" {
  interface User {
    role?: string;
    status?: number;
  }

  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: string;
      status: number;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    status?: number;
    userId?: string;
  }
}
