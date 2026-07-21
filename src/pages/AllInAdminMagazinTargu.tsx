import AllInAdminMagazinDashboard from "./AllInAdminMagazinDashboard";

export default function AllInAdminMagazinTargu(props: {
  actor?: string;
  role?: "admin" | "shop";
}) {
  return (
    <AllInAdminMagazinDashboard
      {...props}
      locationCode="magazin_targu_secuiesc"
      locationName="Magazin - Târgu Secuiesc"
      cityName="Kézdivásárhely üzleti vezérlőpult"
      otherCityHash="#allinadminmagazinciuc"
      otherCityName="Csíkszereda"
    />
  );
}
