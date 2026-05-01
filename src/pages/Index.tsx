import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import HowItWorks from "@/components/HowItWorks";
import PromotionSlider from "@/components/PromotionSlider";
import NextDrawSection from "@/components/NextDrawSection";
import Footer from "@/components/Footer";

export default function Index() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-16">
        <HeroSection />
        <HowItWorks />
        <PromotionSlider />
        <NextDrawSection />
      </main>
      <Footer />
    </div>
  );
}
