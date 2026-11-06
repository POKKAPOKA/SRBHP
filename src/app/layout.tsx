import type { Metadata } from "next";
import Header from "./components/Header";
import { Suspense } from "react";
import "./globals.css";
export const metadata: Metadata = { title: "SRB | 上智大学ゲーム制作サークル", description: "上智大学の音ゲー・ゲーム制作サークル SRB" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ja"><body><Suspense fallback={<header className="h-20 border-b border-slate-200 bg-white" />}><Header /></Suspense><Suspense fallback={<main className="min-h-screen" />}>{children}</Suspense><footer className="border-t border-slate-200 px-6 py-8 text-center text-sm text-slate-500">© SRB · Sophia University</footer></body></html>; }
