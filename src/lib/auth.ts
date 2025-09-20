// server/auth.ts
import { PrismaClient } from "@prisma/client";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { Polar } from "@polar-sh/sdk";
import { polar, checkout, portal, webhooks } from "@polar-sh/better-auth";
import { db } from "~/server/db";
import { env } from "~/env"; // ensure this loads your .env

// Initialize Polar client
const polarClient = new Polar({
  accessToken: env.POLAR_ACCESS_TOKEN,
  server: "sandbox", // use 'production' if using production token
});

const prisma = new PrismaClient();

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true },
  plugins: [
    polar({
      client: polarClient,
      createCustomerOnSignUp: true, // automatically create Polar customer
      use: [
        // Checkout plugin
        checkout({
          products: [
            { productId: process.env.NEXT_PUBLIC_SMALL_PACK!, slug: "small" },
            { productId: process.env.NEXT_PUBLIC_MEDIUM_PACK!, slug: "medium" },
            { productId: process.env.NEXT_PUBLIC_LARGE_PACK!, slug: "large" },
          ],
          successUrl: "/dashboard",
          authenticatedUsersOnly: true,
        }),

        // Customer portal plugin
        portal(),

        // Webhooks plugin
        webhooks({
          secret: env.POLAR_WEBHOOK_SECRET,
          onOrderPaid: async (order) => {
            const externalCustomerId = order.data.customer.externalId;
            if (!externalCustomerId) throw new Error("No external customer ID found.");

            let creditsToAdd = 0;
            switch (order.data.productId) {
              case process.env.NEXT_PUBLIC_SMALL_PACK:
                creditsToAdd = 50;
                break;
              case process.env.NEXT_PUBLIC_MEDIUM_PACK:
                creditsToAdd = 200;
                break;
              case process.env.NEXT_PUBLIC_LARGE_PACK:
                creditsToAdd = 400;
                break;
            }

            await db.user.update({
              where: { id: externalCustomerId },
              data: { credits: { increment: creditsToAdd } },
            });
          },
        }),
      ],
    }),
  ],
});
