import AllInAdminMagazinDashboard from "./AllInAdminMagazinDashboard";

export default function AllInAdminMagazinCiuc(props: {
  actor?: string;
  role?: "admin" | "shop";
}) {
  return (
    <AllInAdminMagazinDashboard
      {...props}
      locationCode="main_warehouse"
      locationName="Magazin - Miercurea Ciuc"
      cityName="Csíkszereda üzleti vezérlőpult"
      otherCityHash="#allinadminmagazintargu"
      otherCityName="Kézdivásárhely"
    />
  );
}

