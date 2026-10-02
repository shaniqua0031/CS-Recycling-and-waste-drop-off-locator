"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, logout } from "../../lib/auth-api";
import AdminDashboard from "../admin-dashboard";
import type { AdminSection } from "../admin-dashboard";

export default function AdminView({ initialSection = "overview" }: { initialSection?: AdminSection }) {
  const router = useRouter();
  const [email, setEmail] = useState("Admin");

  useEffect(() => {
    getSession()
      .then((session) => {
        if (session.user.role !== "ADMIN") {
          router.replace("/unauthorized");
          return;
        }
        setEmail(session.user.email);
      })
      .catch(() => {
        router.replace("/login");
      });
  }, [router]);

  return (
    <AdminDashboard
      email={email}
      initialSection={initialSection}
      onLogout={async () => {
        await logout();
        router.replace("/login");
      }}
    />
  );
}
