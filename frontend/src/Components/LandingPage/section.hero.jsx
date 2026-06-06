import * as React from "react";
import { Link } from "react-router-dom";

export function SectionHero() {
  return (
    <div className="mx-auto">
    <div className="flex flex-col pt-2 text-white bg-blend-normal">
      {/* Background with a centered gradient in the middle only */}
      <div
        className="flex flex-col items-center px-20 pt-12 pb-2 bg-neutral-900 bg-opacity-70 max-md:px-5 max-md:max-w-full"
        style={{
          background:
            "radial-gradient(circle at center, #9B51E0 0%, transparent 17%)",
        }}
      >
        <div className="text-7xl leading-tight max-md:max-w-full max-md:text-4xl mt-[5rem] max-md:text-center md:text-center">
          Unlock the power of Decades-Old{" "}
        </div>
        {/* Gradient text for "Oil Well Data with Advanced Digitization" */}
        <div className="text-4xl leading-[70px] mt-4 text-transparent bg-clip-text bg-gradient-to-r from-[#9B51E0] to-[#5D8fEc] max-md:max-w-full max-md:text-center md:text-center">
          Oil Well Data with Advanced Digitization
        </div>
        <div className="mt-5 text-xl leading-8 text-center w-[945px] max-md:max-w-[300px] lg:w-[600px] md:w-[600px]">
          At [Company Name], we specialize in transforming legacy oil well
          data into actionable digital formats. Our platform is designed to
          process compensated neutron porosity and formation density graphs
          from the 1960s and 1970s, ensuring data integrity and easy access in
          modern formats like .LAS
        </div>
        {/* Buttons with gradient border */}
        <div className="flex flex-wrap gap-10 mb-[6rem] items-center justify-center mt-11 w-full max-w-screen-xl text-base font-semibold leading-none bg-blend-normal min-h-[52px] max-md:pl-5 max-md:max-w-full">
          {/* Book a Demo with border gradient */}
          <Link to="/login" className="relative p-[2px] rounded-[160px] bg-gradient-to-r from-[#9B51E0] to-[#5D8fEc]">
            <div className="px-5 py-3.5 bg-neutral-900 rounded-[160px] text-white max-md:px-5 hover:bg-[#1B1724]">
              Register Now
            </div>
          </Link>
          {/* Contact Us with border gradient */}
          {/* <div className="relative p-[2px] rounded-[160px] bg-gradient-to-r from-[#9B51E0] to-[#5D8fEc]">
            <div className="px-5 py-3.5 bg-neutral-900 rounded-[160px] text-white max-md:px-5 hover:bg-[#1B1724]">
              Contact Us
            </div>
          </div> */}
        </div>
        <div className="flex shrink-0 mt-4 max-w-full h-px bg-blend-normal bg-neutral-100 bg-opacity-10 w-[949px]" />
      </div>
    </div>
    </div>
  );
}
