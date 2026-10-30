import { BarChart3, CalendarDays, Info, Network, Route, Spline, Table2 } from "lucide-react";
import { set, useStore, type RightTab } from "@/state/store";
import { FluidTabs, type TabItem } from "@/ui/FluidTabs";
import { AttrTable } from "./AttrTable";
import { Charts } from "./Charts";
import { DivisionDays } from "./DivisionDays";
import { FeatureInfo } from "./FeatureInfo";
import { Oob } from "./Oob";
import { PlanVsActual } from "./PlanVsActual";
import { Vectors } from "./Vectors";

export function RightPanel() {
  const page = useStore((s) => s.page);
  const tab = useStore((s) => s.rightTab);
  const tabs: TabItem<RightTab>[] = [
    { id: "charts", label: "Charts", icon: <BarChart3 size={15} /> },
    { id: "table", label: "Table", icon: <Table2 size={15} /> },
    { id: "info", label: "Info", icon: <Info size={15} /> },
    ...(page !== "home" ? [
      { id: "days" as const, label: "Div. days", icon: <CalendarDays size={15} /> },
      { id: "oob" as const, label: "Units", icon: <Network size={15} /> },
      { id: "vectors" as const, label: "Vectors", icon: <Spline size={15} /> },
    ] : []),
    ...(page === "frontier" ? [{ id: "plan" as const, label: "Plan", icon: <Route size={15} /> }] : []),
  ];
  const active = tabs.some((t) => t.id === tab) ? tab : "charts";

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <FluidTabs tabs={tabs} active={active} onChange={(t) => set({ rightTab: t })} />
      <div className={active === "table" ? "min-h-0 flex-1" : "scroll-thin min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-1"}>
        {active === "charts" && <Charts />}
        {active === "table" && <AttrTable />}
        {active === "info" && <FeatureInfo />}
        {active === "days" && <DivisionDays />}
        {active === "oob" && <Oob />}
        {active === "plan" && <PlanVsActual />}
        {active === "vectors" && <Vectors />}
      </div>
    </div>
  );
}
