import { MapPin } from "lucide-react";
import { set, showDefaults, showOnly, useStore, type State } from "@/state/store";
import { Segmented } from "@/ui/Segmented";
import { Checkpoints } from "./Checkpoints";
import { FlowOverTime } from "./FlowOverTime";

type Section = State["groupsSection"];

/** Two ways of grouping the divisions, one at a time, each owning the map: who crossed each phase line together
 * (crossing groups), and who stood within 30 km of each other on each day (local groups). */
export function Groups() {
  const section = useStore((s) => s.groupsSection);
  const open = (v: Section) => {
    if (v !== section) showDefaults();
    set({ groupsSection: v });
  };
  return (
    <div className="flex flex-col gap-2.5">
      <Segmented<Section> size="sm" value={section} onChange={open}
        items={[{ value: "crossing", label: "Crossing groups" }, { value: "local", label: "Local groups" }]} />
      {section === "crossing" ? <Checkpoints /> : (
        <>
          <div className="flex items-center justify-between gap-2">
            <h3 className="display text-[15px]">Local groups by day</h3>
            {/* The map follows the timeline date; Play animates the groups forming, merging and splitting. */}
            <button onClick={() => showOnly(["spreadsurface", "spreadgroups", "breakdots"])}
              className="flex shrink-0 items-center gap-1 rounded-[var(--radius)] border border-border px-2 py-1 text-[12px] hover:bg-muted">
              <MapPin size={13} /> Show on map
            </button>
          </div>
          <FlowOverTime />
        </>
      )}
    </div>
  );
}
