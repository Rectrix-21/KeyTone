import { FeatureWorkspace } from "@/components/dashboard/FeatureWorkspace";
import { ToolPageShell } from "@/components/layout/ToolPageShell";

export default function BpmPage() {
  return (
    <ToolPageShell active="bpm">
      <FeatureWorkspace featureRoute="bpm" />
    </ToolPageShell>
  );
}
