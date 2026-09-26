import { CheckoutView } from "@/components/buyer/CheckoutView";
import { Header } from "@/components/buyer/Header";
import { getPublicSettings } from "@/lib/catalog";
import { DEFAULT_POPULAR_CITIES } from "@/lib/cities";

export const metadata = { title: "Wholesale order bhejein · RD Fashion" };

export default async function CheckoutPage() {
  const settings = await getPublicSettings();
  return (
    <>
      <Header back="/cart" />
      <CheckoutView
        callNumber={settings.call_number}
        whatsappNumber={settings.whatsapp_number}
        popularCities={settings.popular_cities?.length ? settings.popular_cities : DEFAULT_POPULAR_CITIES}
      />
    </>
  );
}
