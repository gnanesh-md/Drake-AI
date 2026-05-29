import * as React from "react";

export function Features() {
  return (
    <div className="flex flex-col bg-blend-normal pt-[5rem]">
      <div className="self-center text-4xl font-bold leading-none text-white max-md:max-w-full max-md:px-8">
        Key Features of Our Digitization Platform
      </div>
      <div className="mt-16 max-w-6xl max-md:mt-10 max-md:max-w-full mx-auto max-md:p-[1rem]">
        <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-center justify-center md:mx-7">
          {/* Card 1 */}
          <div className="flex flex-col max-md:ml-0 max-md:w-full">
            <div className="flex flex-col grow rounded-xl bg-blend-normal max-md:pb-2 max-md:mt-6">
              <div className="flex max-w-full rounded-xl bg-blend-normal min-h-[4px] w-[411px]" />
              <div className="flex flex-col items-start px-7 pt-10 pb-5 rounded-lg border border-solid border-white border-opacity-10 max-w-full bg-blend-normal bg-[#1B1724] w-[411px] max-md:px-5">
                <img
                  loading="lazy"
                  srcSet="https://cdn.builder.io/api/v1/image/assets/TEMP/0a88372671b602184aaf3f508b53c573c09e70f958c9c9ad14f082923b2c4191?apiKey=1d485f9dde7143abb922c2dffce25120&width=100 100w, https://cdn.builder.io/api/v1/image/assets/TEMP/0a88372671b602184aaf3f508b53c573c09e70f958c9c9ad14f082923b2c4191?apiKey=1d485f9dde7143abb922c2dffce25120&width=200 200w, https://cdn.builder.io/api/v1/image/assets/TEMP/0a88372671b602184aaf3f508b53c573c09e70f958c9c9ad14f082923b2c4191?apiKey=1d485f9dde7143abb922c2dffce25120&width=400 400w"
                  className="object-contain bg-blend-normal aspect-[1.16] w-[50px]"
                />
                <div className="mt-5 text-xl font-semibold leading-9 text-white">
                  Multi-Format Support
                </div>
                <div className="self-stretch mt-2.5 text-base font-light leading-8 text-white bg-blend-normal h-[124px] max-md:pb-24">
                  Upload .TIFF files containing compensated neutron porosity and other graphs.
                </div>
              </div>
            </div>
          </div>

          {/* Card 2 */}
          <div className="flex flex-col max-md:ml-0 max-md:w-full">
            <div className="flex flex-col grow rounded-xl bg-blend-normal max-md:pb-2 max-md:mt-6">
              <div className="flex max-w-full rounded-xl bg-blend-normal min-h-[4px] w-[411px]" />
              <div className="flex flex-col items-start px-7 pt-10 pb-5 rounded-lg border border-solid border-white border-opacity-10 max-w-full bg-blend-normal bg-[#1B1724] w-[411px] max-md:px-5">
                {/* <img
                  loading="lazy"
                  src="https://example.com/icon2.png"
                  className="object-contain bg-blend-normal aspect-[1.16] w-[50px]"
                /> */}
                <div
                  className="object-contain bg-blend-normal aspect-[1.16] w-[50px]"
                />
                <div className="mt-5 text-xl font-semibold leading-9 text-white">
                  Real-Time Data Processing
                </div>
                <div className="self-stretch mt-2.5 text-base font-light leading-8 text-white bg-blend-normal h-[124px] max-md:pb-24">
                  Process LAS data instantly for graph and point generation.
                </div>
              </div>
            </div>
          </div>

          {/* Card 3 */}
          <div className="flex flex-col max-md:ml-0 max-md:w-full">
            <div className="flex flex-col grow rounded-xl bg-blend-normal max-md:pb-2 max-md:mt-6">
              <div className="flex max-w-full rounded-xl bg-blend-normal min-h-[4px] w-[411px]" />
              <div className="flex flex-col items-start px-7 pt-10 pb-5 rounded-lg border border-solid border-white border-opacity-10 max-w-full bg-blend-normal bg-[#1B1724] w-[411px] max-md:px-5">
                {/* <img
                  loading="lazy"
                  src="https://example.com/icon3.png"
                  className="object-contain bg-blend-normal aspect-[1.16] w-[50px]"
                /> */}
                <div
                  className="object-contain bg-blend-normal aspect-[1.16] w-[50px]"
                />
                <div className="mt-5 text-xl font-semibold leading-9 text-white">
                  Customizable Outputs
                </div>
                <div className="self-stretch mt-2.5 text-base font-light leading-8 text-white bg-blend-normal h-[124px] max-md:pb-24">
                  Customize graph layouts and export LAS files in the desired format.
                </div>
              </div>
            </div>
          </div>

          {/* Card 4 */}
          <div className="flex flex-col max-md:ml-0 max-md:w-full">
            <div className="flex flex-col grow rounded-xl bg-blend-normal max-md:pb-2 max-md:mt-6">
              <div className="flex max-w-full rounded-xl bg-blend-normal min-h-[4px] w-[411px]" />
              <div className="flex flex-col items-start px-7 pt-10 pb-5 rounded-lg border border-solid border-white border-opacity-10 max-w-full bg-blend-normal bg-[#1B1724] w-[411px] max-md:px-5">
                {/* <img
                  loading="lazy"
                  src="https://example.com/icon4.png"
                  className="object-contain bg-blend-normal aspect-[1.16] w-[50px]"
                /> */}
                <div
                  className="object-contain bg-blend-normal aspect-[1.16] w-[50px]"
                />
                <div className="mt-5 text-xl font-semibold leading-9 text-white">
                  Advanced Analytics
                </div>
                <div className="self-stretch mt-2.5 text-base font-light leading-8 text-white bg-blend-normal h-[124px] max-md:pb-24">
                  Leverage powerful algorithms to analyze data trends efficiently.
                </div>
              </div>
            </div>
          </div>

          {/* Card 5 */}
          <div className="flex flex-col max-md:ml-0 max-md:w-full">
            <div className="flex flex-col grow rounded-xl bg-blend-normal max-md:pb-2 max-md:mt-6">
              <div className="flex max-w-full rounded-xl bg-blend-normal min-h-[4px] w-[411px]" />
              <div className="flex flex-col items-start px-7 pt-10 pb-5 rounded-lg border border-solid border-white border-opacity-10 max-w-full bg-blend-normal bg-[#1B1724] w-[411px] max-md:px-5">
                {/* <img
                  loading="lazy"
                  src="https://example.com/icon5.png"
                  className="object-contain bg-blend-normal aspect-[1.16] w-[50px]"
                /> */}
                <div
                  className="object-contain bg-blend-normal aspect-[1.16] w-[50px]"
                />
                <div className="mt-5 text-xl font-semibold leading-9 text-white">
                  Seamless Integration
                </div>
                <div className="self-stretch mt-2.5 text-base font-light leading-8 text-white bg-blend-normal h-[124px] max-md:pb-24">
                Our .LAS files are ready for seamless integration, allowing for easy analysis and
                    operational use.
                </div>
              </div>
            </div>
          </div>

          {/* Card 6 */}
          <div className="flex flex-col max-md:ml-0 max-md:w-full">
            <div className="flex flex-col grow rounded-xl bg-blend-normal max-md:pb-10 max-md:mt-6">
              <div className="flex max-w-full rounded-xl bg-blend-normal min-h-[4px] w-[411px]" />
              <div className="flex flex-col items-start px-7 pt-10 pb-5 rounded-lg border border-solid border-white border-opacity-10 max-w-full bg-blend-normal bg-[#1B1724] w-[411px] max-md:px-5">
                {/* <img
                  loading="lazy"
                  src="https://example.com/icon6.png"
                  className="object-contain bg-blend-normal aspect-[1.16] w-[50px]"
                /> */}
                <div
                  className="object-contain bg-blend-normal aspect-[1.16] w-[50px]"
                />
                <div className="mt-5 text-xl font-semibold leading-9 text-white">
                  Multi-Device Compatibility
                </div>
                <div className="self-stretch mt-2.5 text-base font-light leading-8 text-white bg-blend-normal h-[124px] max-md:pb-24">
                  Access the platform on any device, ensuring flexibility and mobility.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
