// Velvet Broadcast direction: public creator landing page with a dark cinematic theme and clear signup paths.
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Live from "./pages/Live";
import Login from "./pages/Login";
import Studio from "./pages/Studio";
import Watch from "./pages/Watch";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return <Switch><Route path="/" component={Home} /><Route path="/login" component={Login} /><Route path="/studio" component={Studio} /><Route path="/live" component={Live} /><Route path="/watch" component={Watch} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="dark"><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
