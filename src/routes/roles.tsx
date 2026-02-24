import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/roles")({
  component: () => <Outlet />,
});
