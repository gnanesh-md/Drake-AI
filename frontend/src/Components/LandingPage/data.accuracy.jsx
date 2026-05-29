import * as React from "react";
import Accuracy from "../../assets/pngwing.png";

export function DataAccuracy() {
  return (
    <div className="flex flex-col justify-center items-center max-md:pl-[1rem] lg:m-[2.5rem]">
      {/* <h1 className="text-white font-bold text-4xl">Effortless Data Conversion for the Oil Well Industry</h1> */}
      <div className="flex flex-col lg:flex-row justify-center pt-[10rem] lg:gap-[13rem]">
        {/* Left Section */}
        <div className="flex flex-col items-start justify-center max-w-lg text-white bg-blend-normal">
          <div className="self-stretch pr-8 text-3xl lg:text-4xl font-bold leading-none bg-blend-normal min-h-[52px] max-md:pr-5 max-md:max-w-full">
            Data Accuracy You Can Rely On
          </div>
          <div className="flex flex-col mt-6 sm:mt-8 md:mt-14 text-sm sm:text-base md:text-xl leading-7">
            <div className="pr-3 w-full text-white bg-blend-normal min-h-[175px] max-md:max-w-full">
              Using cutting-edge OCR and data extraction techniques, we
              guarantee precision when digitizing your compensated neutron
              porosity graphs. Our platform maintains the exact integrity of
              your historical data, transforming decades-old prints into modern
              digital formats that preserve every detail.
            </div>
          </div>
        </div>

        {/* Right Section */}
        <div className="relative flex flex-col rounded-none max-w-[604px] mt-10 lg:mt-0">
          <div
            className=""
            style={{
              position: "absolute",
              left: "-120px", // Move it further left to avoid cutting
              top: "0",
              height: "80%",
              width: "310px", // Increase width for more visible gradient
              background:
                "radial-gradient(circle at center, #FB37FF 0%, transparent 50%)",
              zIndex: 0, // Make sure it stays behind the content
            }}
          />
          <div className="flex flex-col items-start pt-12 max-w-full rounded-2xl max-md:w-[370px] md:w-[400px] lg:w-[400px] max-md:pr-5 bg-violet-500">
            <div className="flex z-10 flex-col px-4 py-5 w-full rounded-2xl shadow-lg bg-zinc-900 max-md:max-w-full">
              <img src={Accuracy} alt="" />
            </div>
          </div>
        </div>
      </div>
      <div className="flex mt-24 max-w-full bg-blend-normal bg-neutral-100 bg-opacity-10 min-h-[1px] w-[896px] max-md:mt-10" />
    </div>
  );
}

export default DataAccuracy;
