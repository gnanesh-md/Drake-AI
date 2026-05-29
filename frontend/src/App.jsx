import { useState } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import "./App.css";
import ImageAnnotationApp from "./Components/Annotations";
import AnnotationApp from "./Components/Annotations/annotation";
import ProjectForm from "./Components/Annotations/annotation";
import { ImageUpload } from "./Components/ImageUpload/image";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useNavigate,
} from "react-router-dom";
import Navbar from "./Components/Dashboard/navbar";
import Display from "./Components/Dashboard/display";
import Canvas from "./Components/Dashboard/display5";
import GraphTrackerV2 from "./Components/DashboardV2/GraphTrackerV2";
import { HeroSection } from "./Components/LandingPage/hero.section";
import { Login } from "./Components/Login/login";
import { SignUp } from "./Components/SignUp/signup";
import { ForgotPassword } from "./Components/ForgotPassword";
import ImageSplitter from "./Components/Dashboard/display2";
import { NavigationBar } from "./Components/LandingPage/navigation.bar";
import { SectionHero } from "./Components/LandingPage/section.hero";
import { GetStarted } from "./Components/LandingPage/get.started";
import CombinedComponent from "./Components/LandingPage/upload.legacy";
import Automated from "./Components/LandingPage/automated";
import Overlay from "./Components/LandingPage/overlay";
import EditingControl from "./Components/LandingPage/editing";
import DataAccuracy from "./Components/LandingPage/data.accuracy";
import { Features } from "./Components/LandingPage/features";
import { Footer } from "./Components/LandingPage/footer";
import { ChooseUsSection } from "./Components/LandingPage/choose.section";
import { Toaster } from 'react-hot-toast';

function App() {
  const [count, setCount] = useState(0);

  return (
    <>
      <Toaster />
      <Router>
        <Routes>
          <Route
            path="/"
            element={
              <>
                {/* <HeroSection/> */}
                <NavigationBar />
                <SectionHero />
                <GetStarted />
                <CombinedComponent />
                <Automated />
                <Overlay />
                <EditingControl />
                <DataAccuracy />
                <Features />
                <ChooseUsSection />
                <Footer />
                {/* <Experience/>
            <Assisting/>
            <Joining/>
            <Teams/>
            <ContactUs/>
            <Footer/> */}
              </>
            }
          />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/dashboard" element={<GraphTrackerV2 />} />
          <Route path="/dashboard2" element={<ImageSplitter />} />
        </Routes>
      </Router>
      {/* <BrowserRouter>
      <Navbar/>
      </BrowserRouter>
      <Canvas/> */}
    </>
  );
}

export default App;
