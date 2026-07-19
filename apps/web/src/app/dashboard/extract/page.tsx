import { FeatureWorkspace } from "@/components/dashboard/FeatureWorkspace";
import { ToolPageShell } from "@/components/layout/ToolPageShell";

export default function ExtractPage() {
  return (
    <ToolPageShell active="extract">
      <FeatureWorkspace featureRoute="extract" />
    </ToolPageShell>
  );
}
