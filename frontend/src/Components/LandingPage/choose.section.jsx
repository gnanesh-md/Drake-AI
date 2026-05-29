import * as React from "react";

export function ChooseUsSection() {
  return (
    <div className="flex flex-col items-center justify-center">
      <div className="flex mt-24 max-w-full bg-blend-normal bg-neutral-100 bg-opacity-10 min-h-[1px] w-[896px] max-md:mt-10" />
      <div className="flex flex-col items-center justify-center px-11 py-16 mt-20 w-full max-w-screen-xl bg-[#1B1724] rounded-[34px] max-md:px-5 max-md:mt-10 max-md:max-w-full">
        <div className="text-center text-4xl font-bold leading-none text-white">
          Why Choose Us
        </div>
        <div className="mt-14 w-full max-md:mt-10 max-md:max-w-full">
          <div className="flex justify-center gap-5 max-md:flex-col">
            {/* Card 1 */}
            <div className="flex flex-col w-[33%] max-md:w-full">
              <div className="flex flex-col p-[0.25rem] bg-gradient-to-r from-[#9B51E0] to-[#5D8fEc] rounded-[35px]">
                <div className="flex flex-col px-4 pt-5 pb-8 text-white rounded-[32px] bg-[#1D1C2D]">
                  <div className="text-xl font-bold leading-10 max-md:mr-1.5">
                    Decades of Industry Knowledge
                  </div>
                  <div className="mt-4 text-sm leading-8">
                    We understand the nuances of well data from the 1960s and 70s,
                    and our platform is specifically designed to digitize these
                    legacy formats accurately.
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2 */}
            <div className="flex flex-col w-[33%] max-md:w-full">
              <div className="flex flex-col grow p-[0.25rem] bg-gradient-to-r from-[#9B51E0] to-[#5D8fEc] rounded-[35px]">
                <div className="flex flex-col px-5 pt-5 pb-9 text-white rounded-[32px] bg-[#1D1C2D] h-full">
                  <div className="text-xl font-bold leading-10 max-md:mr-1.5">
                    Seamless Integration
                  </div>
                  <div className="mt-4 text-sm leading-8">
                    Our .LAS files are ready for seamless integration into your
                    existing geological software, allowing for easy analysis and
                    operational use.
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3 */}
            <div className="flex flex-col w-[33%] max-md:w-full">
              <div className="flex flex-col grow p-1 bg-gradient-to-r from-[#9B51E0] to-[#5D8fEc] rounded-[35px]">
                <div className="flex flex-col px-5 pt-5 pb-8 text-white rounded-[32px] bg-[#1D1C2D] h-full">
                  <div className="text-xl font-bold leading-10 max-md:mr-1.5">
                    Advanced OCR Technology
                  </div>
                  <div className="mt-4 text-sm leading-8">
                    We utilize advanced OCR and digitization algorithms tailored to
                    oil well logs, ensuring accuracy and high-quality outputs.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChooseUsSection;
