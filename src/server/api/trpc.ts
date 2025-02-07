import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { RolePermissions } from "@/utils/permissions";
import { getServerAuthSession } from "@/server/auth";
import { prisma } from "@/server/db";
import type { Session } from "next-auth";

export type Context = {
  prisma: typeof prisma;
  session: Session | null;
};

import type { CreateNextContextOptions } from '@trpc/server/adapters/next';

export const createTRPCContext = async (opts: CreateNextContextOptions) => {
  const { req, res } = opts;
  const session = await getServerAuthSession({ req, res });

  // Ensure we have the user's roles in the session
  if (session?.user) {
    const userWithRoles = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { roles: true }
    });
    
    session.user.roles = userWithRoles?.roles || [];
  }

  return {
    prisma,
    session,
  };
};

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    console.error('TRPC Error:', error);
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
        code: error.code,
        message: error.message,
      },
    };
  },
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

const enforceUserIsAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.session || !ctx.session.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be logged in to access this resource',
    });
  }
  return next({
    ctx: {
      session: { ...ctx.session, user: ctx.session.user },
    },
  });
});


export const protectedProcedure = t.procedure.use(enforceUserIsAuthed);

const enforceUserHasPermission = (requiredPermission: string) =>
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'You must be logged in to access this resource',
      });
    }

    // Get all permissions for the user's roles
    const userPermissions = ctx.session.user.roles.flatMap(role => 
      RolePermissions[role as keyof typeof RolePermissions] || []
    );

    if (!userPermissions.includes(requiredPermission)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You do not have permission to access this resource',
      });
    }

    return next({
      ctx: {
        ...ctx,
        session: {
          ...ctx.session,
          user: {
            ...ctx.session.user,
            permissions: userPermissions
          }
        }
      },
    });
  });

export const permissionProtectedProcedure = (permission: string) =>
  t.procedure.use(enforceUserHasPermission(permission));