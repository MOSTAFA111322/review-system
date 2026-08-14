import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import { Link, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "./_core/hooks/useAuth";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Reports from "./pages/Reports";
import ReviewDetail from "./pages/ReviewDetail";
import ReviewEdit from "./pages/ReviewEdit";
import Settings from "./pages/Settings";
import Users from "./pages/Users";
import Login from "./pages/Login";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path="/reviews/:id/edit" component={ReviewEdit} />
      <Route path="/reviews/:id" component={ReviewDetail} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/reports" component={Reports} />
      <Route path="/settings" component={Settings} />
      <Route path="/users" component={Users} />
      <Route path="/login" component={Login} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
          <ReviewEditShortcut />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

function ReviewEditShortcut() {
  const [location] = useLocation();
  const { user } = useAuth();
  const match = location.match(/^\/reviews\/(\d+)$/);
  const canUpdate = Boolean(user?.permissions?.includes("*") || user?.permissions?.includes("reviews.update"));
  if (!match || !canUpdate) return null;
  return <Link href={`/reviews/${match[1]}/edit`} className="fixed bottom-6 left-6 z-50 rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-400">تعديل المراجعة</Link>;
}

export default App;
