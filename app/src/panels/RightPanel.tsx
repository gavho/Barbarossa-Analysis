import { BarChart3, CalendarDays, GitBranch, Info, Network, Route, Spline, Table2, Users } from "lucide-react";
import { get, set, showDefaults, useStore, type RightTab } from "@/state/store";
import { FluidTabs, type TabItem } from "@/ui/FluidTabs";
import { AttrTable } from "./AttrTable";
import { Charts } from "./Charts";
import { DivisionDays } from "./DivisionDays";
import { FeatureInfo } from "./FeatureInfo";
import { Oob } from "./Oob";
import { PlanVsActual } from "./PlanVsActual";
import { Vectors } from "./Vectors";
import { Phases } from "./Phases";
import { Groups } from "./Groups";

/** Tabs whose map layers belong to them alone (see showOnly). */
const ANALYSIS: RightTab[] = ["vectors", "phases", "groups"];

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
    ...(page === "frontier" ? [
      { id: "plan" as const, label: "Plan", icon: <Route size={15} /> },
      { id: "phases" as const, label: "Phases", icon: <GitBranch size={15} /> },
      { id: "groups" as const, label: "Groups", icon: <Users size={15} /> },
    ] : []),
  ];
  const active = tabs.some((t) => t.id === tab) ? tab : "charts";

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <FluidTabs tabs={tabs} active={active} onChange={(t) => {
        if (ANALYSIS.includes(get().rightTab) && t !== get().rightTab) showDefaults(); // an analysis view's layers leave with it
        set({ rightTab: t });
      }} />
      <div className={active === "table" ? "min-h-0 flex-1" : "scroll-thin min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-1"}>
        {active === "charts" && <Charts />}
        {active === "table" && <AttrTable />}
        {active === "info" && <FeatureInfo />}
        {active === "days" && <DivisionDays />}
        {active === "oob" && <Oob />}
        {active === "plan" && <PlanVsActual />}
        {active === "vectors" && <Vectors />}
        {active === "phases" && <Phases />}
        {active === "groups" && <Groups />}
      </div>
    </div>
  );
}
