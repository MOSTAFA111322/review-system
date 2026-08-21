import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { startLogin } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import {   Bell, ClipboardCheck, FileBarChart, FileSpreadsheet, LayoutDashboard, ListChecks, LogOut, Moon, Settings, Sun, Users } from "lucide-react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { useTheme } from "../contexts/ThemeContext";

const navigation = [
  { icon: ClipboardCheck, label: "لوحة المراجعات", path: "/" },
  { icon: ListChecks, label: "مهامي", path: "/my-tasks", permission: "reviews.view.assigned" },
  { icon: ClipboardCheck, label: "المهام اليومية", path: "/daily-tasks", permission: "dailyTasks.view" },
  { icon: FileSpreadsheet, label: "متابعة سداد الإيجارات", path: "/rent-follow-ups", permission: "rentFollowUps.view" },
  { icon: LayoutDashboard, label: "لوحة الأداء", path: "/dashboard" },
  { icon: FileBarChart, label: "الخلاصة والتقارير", path: "/reports" },
  { icon: Settings, label: "الإعدادات", path: "/settings", permission: "settings.manage" },
  { icon: Users, label: "المستخدمون والأدوار", path: "/users", permission: "users.manage" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();

  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) {
    return (
      <main dir="rtl" className="min-h-screen bg-[radial-gradient(circle_at_top_right,#e0edff,transparent_44%),linear-gradient(135deg,#f8fafc,#eef6ff)] flex items-center justify-center p-5">
        <section className="w-full max-w-md rounded-3xl border border-white/70 bg-white/85 p-9 text-center shadow-xl shadow-slate-900/5 backdrop-blur">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-700 text-white shadow-lg shadow-blue-700/25"><ClipboardCheck className="h-7 w-7" /></div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">نظام المراجعة</h1>
          <p className="mt-3 leading-7 text-slate-500">سجّل دخولك للوصول إلى عمليات المراجعة المكلّف بها وصلاحيات فريقك.</p>
          <Button onClick={() => window.location.assign("/login")} size="lg" className="mt-7 w-full bg-blue-700 hover:bg-blue-800">تسجيل الدخول</Button>
          <Button variant="outline" onClick={() => startLogin()} className="mt-3 w-full">الدخول عبر Manus OAuth</Button>
        </section>
      </main>
    );
  }

  return <AuthenticatedShell>{children}</AuthenticatedShell>;
}

function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const utils = trpc.useUtils();
  const notifications = trpc.notifications.list.useQuery({ unreadOnly: false });
  const markNotificationRead = trpc.notifications.markRead.useMutation({ onSuccess: () => utils.notifications.list.invalidate() });
  const unreadCount = notifications.data?.filter(item => !item.readAt).length ?? 0;
  const [location, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const permissions = user?.permissions ?? [];
  const hasPermission = (permission?: string) => !permission || permissions.includes("*") || permissions.includes(permission);
  const visibleNavigation = navigation.filter(item => hasPermission(item.permission));
  const activeItem = visibleNavigation.find(item => item.path === location) ?? visibleNavigation[0];

  return (
    <SidebarProvider dir="rtl" defaultOpen>
      <Sidebar side="right" collapsible="icon" className="border-l border-r-0 border-slate-200 bg-white">
        <SidebarHeader className="h-20 justify-center border-b border-slate-100 px-3">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-700 to-indigo-700 text-white shadow-md shadow-blue-700/25"><ClipboardCheck className="h-5 w-5" /></div>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-sm font-bold text-slate-900">نظام المراجعة</p>
              <p className="truncate text-xs text-slate-400">إدارة ومتابعة العمليات</p>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent className="px-2 py-4">
          <SidebarMenu>
            {visibleNavigation.map(item => {
              const active = item.path === location;
              return (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton isActive={active} tooltip={item.label} onClick={() => setLocation(item.path)} className="h-11 rounded-xl px-3 text-slate-600 data-[active=true]:bg-blue-50 data-[active=true]:font-semibold data-[active=true]:text-blue-800 hover:bg-slate-50">
                    <item.icon className={`h-[18px] w-[18px] ${active ? "text-blue-700" : ""}`} />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="border-t border-slate-100 p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-right transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
                <Avatar className="h-9 w-9 shrink-0 border border-slate-200"><AvatarFallback className="bg-slate-100 text-xs font-bold text-slate-600">{user?.name?.slice(0, 1) ?? "م"}</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                  <p className="truncate text-sm font-semibold text-slate-700">{user?.name || "مستخدم النظام"}</p>
                  <p className="truncate text-xs text-slate-400">{user?.roles?.[0]?.name ?? "مستخدم"}</p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52 text-right">
              <DropdownMenuItem onClick={logout} className="gap-2 text-red-600 focus:text-red-700"><LogOut className="h-4 w-4" />تسجيل الخروج</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="bg-[#f7f9fc]">
        <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-slate-200/80 bg-[#f7f9fc]/90 px-4 backdrop-blur md:px-7">
          <div className="flex items-center gap-3">
            {isMobile ? <SidebarTrigger className="rounded-xl bg-white shadow-sm" /> : null}
            <div>
              <p className="text-xs font-medium text-slate-400">مساحة العمل</p>
              <h2 className="text-base font-bold text-slate-800">{activeItem?.label ?? "نظام المراجعة"}</h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleTheme} aria-label={theme === "dark" ? "تفعيل الوضع النهاري" : "تفعيل الوضع الليلي"} title={theme === "dark" ? "الوضع النهاري" : "الوضع الليلي"} className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
              {theme === "dark" ? <Sun className="h-[18px] w-[18px] text-amber-300" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>
            <DropdownMenu><DropdownMenuTrigger asChild><button aria-label="الإشعارات" className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50"><Bell className="h-[18px] w-[18px]" />{unreadCount ? <span className="absolute left-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-700 px-1 text-[9px] font-bold text-white">{unreadCount > 9 ? "9+" : unreadCount}</span> : null}</button></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-80 p-2 text-right"><div dir="rtl"><p className="px-2 py-2 text-sm font-bold text-slate-800">الإشعارات</p>{notifications.isLoading ? <p className="px-2 py-3 text-sm text-slate-500">جارٍ التحميل…</p> : notifications.data?.length ? notifications.data.slice(0, 6).map(item => <DropdownMenuItem key={item.id} onSelect={() => { if (!item.readAt) markNotificationRead.mutate({ id: item.id }); if (item.link) setLocation(item.link); }} className={`block cursor-pointer whitespace-normal rounded-lg px-2 py-2.5 ${item.readAt ? "opacity-70" : "bg-blue-50/70"}`}><p className="text-sm font-semibold text-slate-700">{item.title}</p>{item.body ? <p className="mt-1 text-xs leading-5 text-slate-500">{item.body}</p> : null}</DropdownMenuItem>) : <p className="px-2 py-4 text-sm text-slate-500">لا توجد إشعارات جديدة.</p>}</div></DropdownMenuContent></DropdownMenu>
          </div>
        </header>
        <main className="min-h-[calc(100vh-5rem)] p-4 md:p-7">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
