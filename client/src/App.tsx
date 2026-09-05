// Velvet Broadcast direction: public creator landing page with a dark cinematic theme and clear signup paths.
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Admin from "./pages/Admin";
import CompanionChat from "./pages/CompanionChat";
import Companions from "./pages/Companions";
import CreateCompanion from "./pages/CreateCompanion";
import Home from "./pages/Home";
import Live from "./pages/Live";
import Login from "./pages/Login";
import SelfAvatar from "./pages/SelfAvatar";
import Studio from "./pages/Studio";
import Watch from "./pages/Watch";

// lensflow.au is the companion app (the Vidy-style product); the creator
// platform lives on lensflow.com.au (a separate deployment) and the Render
// URL. On the companion domain, "/" is the companion landing and the
// creator hub moves to "/creators" — still reachable, just not the front
// door. Every other route is shared.
const COMPANION_HOSTS = new Set(["lensflow.au", "www.lensflow.au"]);
const isCompanionDomain = typeof window !== "undefined" && COMPANION_HOSTS.has(window.location.hostname);

function Router() {
  // make sure to consider if you need authentication for certain routes
  // note: /companions/create-self-avatar is registered before the
  // /companions/:id param route below, since wouter matches path order.
  return <Switch><Route path="/" component={isCompanionDomain ? Companions : Home} /><Route path="/creators" component={Home} /><Route path="/login" component={Login} /><Route path="/studio" component={Studio} /><Route path="/live" component={Live} /><Route path="/watch" component={Watch} /><Route path="/companions" component={Companions} /><Route path="/companions/create" component={CreateCompanion} /><Route path="/companions/create-self-avatar" component={SelfAvatar} /><Route path="/companions/:id" component={CompanionChat} /><Route path="/admin" component={Admin} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="dark"><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
