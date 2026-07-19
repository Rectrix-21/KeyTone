import { FeatureWorkspace } from "@/components/dashboard/FeatureWorkspace";
import { ToolPageShell } from "@/components/layout/ToolPageShell";

export default function KeyChangerPage() {
  return (
    <ToolPageShell active="keychanger">
      <FeatureWorkspace featureRoute="keychanger" />
    </ToolPageShell>
  );
}
