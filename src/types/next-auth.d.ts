import "next-auth";

declare module "next-auth" {
  interface User {
    role?: string;
    teacherId?: string | null;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      teacherId: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    teacherId?: string | null;
  }
}
