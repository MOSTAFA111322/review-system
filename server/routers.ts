import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import { employeesRouter, rolesRouter, setupRouter, usersRouter } from "./routers/admin";
import { analyticsRouter } from "./routers/analytics";
import { dailyTasksRouter } from "./routers/dailyTasks";
import { authRouter } from "./routers/auth";
import { activityRouter, commentsRouter } from "./routers/collaboration";
import { attachmentsRouter, customFieldsRouter, notificationsRouter } from "./routers/extendedFeatures";
import { fiscalYearsRouter } from "./routers/fiscalYears";
import { reviewsRouter } from "./routers/reviews";
import { rentFollowUpsRouter } from "./routers/rentFollowUps";
import { rentEntitiesRouter } from "./routers/rentEntities";
import { rentSettlementsRouter } from "./routers/rentSettlements";
import { settingsRouter } from "./routers/settings";
import { dashboardPreferencesRouter } from "./routers/dashboardPreferences";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: authRouter,
  setup: setupRouter,
  fiscalYears: fiscalYearsRouter,
  users: usersRouter,
  roles: rolesRouter,
  employees: employeesRouter,
  settings: settingsRouter,
  dashboardPreferences: dashboardPreferencesRouter,
  reviews: reviewsRouter,
  comments: commentsRouter,
  activity: activityRouter,
  attachments: attachmentsRouter,
  customFields: customFieldsRouter,
  notifications: notificationsRouter,
  analytics: analyticsRouter,
  dailyTasks: dailyTasksRouter,
  rentFollowUps: rentFollowUpsRouter,
  rentEntities: rentEntitiesRouter,
  rentSettlements: rentSettlementsRouter,
});

export type AppRouter = typeof appRouter;
