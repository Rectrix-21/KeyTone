import { FeatureWorkspace } from "@/components/dashboard/FeatureWorkspace";
import { ToolPageShell } from "@/components/layout/ToolPageShell";

export default function GeneratorPage() {
  return (
    <ToolPageShell active="generator">
      <FeatureWorkspace featureRoute="generator" />
    </ToolPageShell>
  );
}
