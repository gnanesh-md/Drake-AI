import * as React from "react";
import Automation1 from "../../assets/flowchart.jpg";

export function Automated() {
  return (
    <div className="flex flex-col lg:flex-row justify-center pt-10 gap-8 md:gap-16 lg:gap-[6.5rem] xl:gap-[13rem] lg:m-[2.5rem] max-md:pl-[1rem]">
      {/* Left Section */}
      <div className="relative flex flex-col rounded-none max-w-full lg:max-w-[604px] md:items-center md:order-2 lg:order-2 max-md:order-2">
        <div
          className="hidden lg:block"
          style={{
            position: "absolute",
            right: "-120px",
            top: "0",
            height: "80%",
            width: "310px",
            background:
              "radial-gradient(circle at center, #18B2DE 0%, transparent 50%)",
            zIndex: 0,
          }}
        />
        <div className="flex flex-col items-start pt-12 rounded-2xl w-full xl:w-[469px] lg:w-[380px] bg-violet-500 md:w-[500px] ">
          <div className="flex z-10 flex-col px-4 py-2 w-full rounded-2xl shadow-lg bg-zinc-900">
            <img src={Automation1} alt="Automation Flowchart" />
          </div>
        </div>
      </div>

      {/* Right Section */}
      <div className="flex flex-col items-start justify-center max-w-full lg:max-w-lg text-white md:items-center md:text-center max-md:order-1 md:order-1 lg:order-2">
        <div className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-none pr-8 lg:pr-0 pb-6 lg:pb-0">
          Automated Digitization to .LAS Format
        </div>
        <div className="flex flex-col mt-6 sm:mt-8 md:mt-5 text-sm sm:text-base md:text-xl leading-7 md:text-left">
          <div className="md:w-[500px]">
            Say goodbye to manual data entry. Our advanced system automatically
            extracts and digitizes critical data into .LAS format, maintaining
            accurate depth measurements and coordinate systems. This ensures you
            can work with well logs that are immediately usable for analysis and
            reporting.
          </div>
        </div>
      </div>
    </div>
  );
}

export default Automated;
