import { FeatureWorkspace } from "@/components/dashboard/FeatureWorkspace";
import { ToolPageShell } from "@/components/layout/ToolPageShell";

export default function SimilarPage() {
  return (
    <ToolPageShell active="similar">
      <FeatureWorkspace featureRoute="similar" />
    </ToolPageShell>
  );
}
