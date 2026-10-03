"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Editor from "@/components/editor/editor";
import { Loading } from "@/components/editor/loading";

export default function EditorPage() {
  const params = useParams();
  const projectId = typeof params?.projectId === "string" ? params.projectId : "";
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (projectId) setReady(true);
  }, [projectId]);

  if (!ready || !projectId) {
    return (
      <div className="h-screen w-screen">
        <Loading />
      </div>
    );
  }

  return <Editor projectId={projectId} />;
}
