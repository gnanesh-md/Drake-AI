import * as React from "react";
import Overlay1 from "../../assets/graph2.png";

export function Overlay() {
  return (
    <div className="flex flex-col justify-center items-center max-md:pl-[1rem] lg:m-[2.5rem]">
      {/* <h1 className="text-white font-bold text-4xl">Effortless Data Conversion for the Oil Well Industry</h1> */}
      <div className="flex flex-col lg:flex-row justify-center pt-[10rem] lg:gap-[13rem]">
        {/* Left Section */}
        <div className="flex flex-col items-start justify-center max-w-lg text-white bg-blend-normal">
          <div className="self-stretch pr-8 text-2xl lg:text-4xl font-bold leading-none bg-blend-normal min-h-[52px] max-md:pr-2 max-md:max-w-full">
            Overlay Digital Plots for Easy Review
          </div>
          <div className="flex flex-col mt-6 sm:mt-8 md:mt-14 text-sm sm:text-base md:text-xl leading-7">
            <div className="pr-3 w-full text-white bg-blend-normal min-h-[175px] max-md:max-w-full">
              After the digitization process, the newly created digital plot is
              overlaid directly onto the original image plot. This ensures you
              can easily compare and verify the accuracy of the digitized data
              with the historical graph.
            </div>
          </div>
        </div>

        {/* Right Section */}
        <div className="relative flex flex-col rounded-none max-w-[469px] mt-5 lg:mt-0 max-md:max-w-[469px]">
          <div
            className=""
            style={{
              position: "absolute",
              left: "-120px", // Move it further left to avoid cutting
              top: "0",
              height: "80%",
              width: "310px", // Increase width for more visible gradient
              background: "radial-gradient(circle at center, #FB37FF 0%, transparent 50%)",
              zIndex: 0, // Make sure it stays behind the content
            }}
          />
          <div className="flex flex-col items-start pt-12 max-w-full rounded-2xl max-md:w-[370px] lg:w-[400px] max-md:pr-5 bg-violet-500">
            <div className="flex z-10 flex-col px-4 py-2 w-full rounded-2xl shadow-lg bg-zinc-900 max-md:max-w-full">
              <div>
                <img src={Overlay1} alt="" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Overlay;
