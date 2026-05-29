import React, { useState, useEffect } from "react";
import Upload1 from "../../assets/upload1.png";
import Upload2 from "../../assets/upload2.png";

export function CombinedComponent() {
  const [showFirstImage, setShowFirstImage] = useState(true);
  useEffect(() => {
    const interval = setInterval(() => {
      setShowFirstImage((prev) => !prev);
    }, 3000); // Switch image every 3 seconds

    return () => clearInterval(interval); // Cleanup interval on component unmount
  }, []);

  return (
    <div className="flex flex-col justify-center items-center pt-20 px-4 sm:pt-16">
      <h1 className="text-white font-bold text-2xl sm:text-3xl md:text-4xl text-center">
        Effortless Data Conversion for the Oil Well Industry
      </h1>
      <div className="flex flex-col lg:flex-row justify-center pt-10 gap-8 md:gap-16 lg:gap-[13rem] lg:m-[2.5rem]">
        {/* Left Section */}
        <div className="flex flex-col items-start justify-center max-w-lg text-white">
          <div className="text-2xl sm:text-3xl md:text-4xl font-bold leading-none min-h-[52px]">
            Upload Your Legacy Data
          </div>
          <div className="flex flex-col mt-6 sm:mt-8 md:mt-14 text-sm sm:text-base md:text-xl leading-7">
            <div className="text-white">
              Easily upload long-compensated neutron porosity and formation
              density graphs stored in .TIFF files, even if recorded decades
              ago. Our platform supports large-scale image formats and digitizes
              everything from formation density to gamma rays versus depth.
            </div>
          </div>
          {/* <div className="flex flex-col justify-center p-0.5 mt-10 max-w-full text-base font-semibold leading-none bg-blend-normal rounded-[160px] max-md:mt-10 bg-gradient-to-r from-[#9B51E0] to-[#5D8fEc]">
            <div className="relative overflow-hidden px-8 py-3.5 bg-blend-normal bg-neutral-900 rounded-[160px] max-md:px-5 hover:bg-[#1B1724]">
              Explore more
            </div>
          </div> */}
        </div>

        {/* Right Section */}
        <div className="flex relative flex-col rounded-none max-w-full md:max-w-[469px] lg:w-[400px]">
          <div
            className="hidden lg:block"
            style={{
              position: "absolute",
              left: "-120px",
              top: "0",
              height: "80%",
              width: "310px",
              background:
                "radial-gradient(circle at center, #FB37FF 0%, transparent 50%)",
              zIndex: 1,
            }}
          />
          <div
            className="flex flex-col items-start pt-12 rounded-2xl w-full md:w-[469px] bg-violet-500"
            style={{ zIndex: 1 }}
          >
            <div className="flex flex-col px-4 py-5 w-full rounded-2xl shadow-lg bg-zinc-900">
              <div className="relative w-full h-[300px] sm:h-[350px] md:h-[404px]">
                <img
                  src={Upload1}
                  alt="First Image"
                  className={`absolute w-full h-full object-cover transition-opacity duration-1000 ${
                    showFirstImage ? "opacity-100" : "opacity-0"
                  }`}
                />
                <img
                  src={Upload2}
                  alt="Second Image"
                  className={`absolute w-full h-full object-cover transition-opacity duration-1000 ${
                    showFirstImage ? "opacity-0" : "opacity-100"
                  }`}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CombinedComponent;
