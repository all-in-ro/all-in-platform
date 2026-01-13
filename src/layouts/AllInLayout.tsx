import { Button } from "@/components/ui/button";

export default function AllInLayout({
  children,
  actor,
  role,
  shopId,
  onLogout
}: {
  children: React.ReactNode;
  actor: string;
  role: "admin" | "shop";
  shopId?: string;
  onLogout: () => void;
}) {
  return (
    <div className="w-screen h-screen overflow-hidden" style={{ backgroundColor: "#474c59" }}>
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="text-white/90 text-sm font-semibold">
          ALL IN – {role === "admin" ? "ADMIN" : `ÜZLET (${shopId})`} – {actor}
        </div>
        <Button
          onClick={onLogout}
          className="h-9 px-4 rounded-xl text-white bg-[#354153] hover:bg-[#3c5069] border border-white/40"
        >
          Kilépés
        </Button>
      </div>

      <div className="h-[calc(100%-56px)] grid place-items-center">
        {children}
      </div>
    </div>
  );
}
