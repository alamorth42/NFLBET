"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    router.replace(user ? "/l" : "/login");
  }, [user, loading, router]);
  return <div className="p-8 text-mu font-mono text-sm">Chargement…</div>;
}
