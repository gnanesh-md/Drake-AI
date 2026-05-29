import * as React from "react";
import Editing1 from "../../assets/editing.png";

export function EditingControl() {
  return (
    <div className="flex flex-col lg:flex-row justify-center items-center pt-[10rem] lg:gap-[13rem] max-md:pl-[1rem] md:pl-0 md:items-center md:justify-center lg:m-[2.5rem]">
      {/* Right Section (Displayed First on Small and Medium Screens) */}
      <div className="lg:order-2 flex flex-col items-start justify-center max-w-lg text-white bg-blend-normal md:text-center">
        <div className="self-stretch pr-8 text-3xl lg:text-4xl font-bold leading-2 bg-blend-normal min-h-[52px] max-md:pr-5 max-md:max-w-full md:text-left">
          Full Editing Control
        </div>
        <div className="flex flex-col mt-6 sm:mt-8 md:mt-14 text-sm sm:text-base md:text-xl leading-7 md:text-left">
          <div className="">
            If the AI-generated plot needs adjustments, our platform offers a
            comprehensive editing suite. You can fine-tune the digital plot
            directly on the dashboard, ensuring that any shortcomings are
            corrected before exporting. Once edited, the plot can be exported
            back into the same format, maintaining consistency and precision.
          </div>
        </div>
      </div>

      {/* Left Section (Displayed Second on Small and Medium Screens) */}
      <div className="lg:order-1 relative flex flex-col mt-2 rounded-none max-w-[604px] ">
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
        <div className="flex flex-col items-start justify-start pt-12 max-w-full rounded-2xl max-md:w-[365px] max-md:pr-5 bg-violet-500 md:w-[410px] md:mt-5">
          <div className="flex z-10 flex-col px-4 py-5 w-full rounded-2xl shadow-lg bg-zinc-900 max-md:max-w-full">
            <img src={Editing1} alt="" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default EditingControl;
