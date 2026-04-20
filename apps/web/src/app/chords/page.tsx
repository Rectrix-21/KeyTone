import { FeatureWorkspace } from "@/components/dashboard/FeatureWorkspace";
import { ToolPageShell } from "@/components/layout/ToolPageShell";

export default function ChordsPage() {
  return (
    <ToolPageShell active="chords">
      <FeatureWorkspace featureRoute="chords" />
    </ToolPageShell>
  );
}
