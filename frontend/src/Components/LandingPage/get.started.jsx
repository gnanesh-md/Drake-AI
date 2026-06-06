import * as React from "react";
import { Link } from "react-router-dom";

export function GetStarted() {
  return (
    <div className="flex flex-col items-center px-12 md:px-24 lg:px-48 pt-24 font-medium text-indigo-400 bg-blend-normal max-md:px-5">
      <div className="flex gap-8 items-start max-w-full bg-blend-normal h-auto w-full md:w-[768px] lg:w-[896px]">
        <div className="flex flex-col items-start pt-2.5 bg-blend-normal min-w-[240px] w-full md:w-[768px] lg:w-[860px]">
          <div className="text-sm font-semibold leading-none uppercase tracking-[4px]">
            Get Started Today
          </div>
          <div className="self-stretch pr-0.5 mt-2.5 text-2xl font-normal leading-10 text-white bg-blend-normal max-md:pb-2 max-md:max-w-full">
            Upload your compensated neutron porosity graphs today and experience
            the ease and precision of digitization with [Company Name]. Join
            leading oil well companies in transforming legacy well data into
            actionable insights.
          </div>
          <div className="flex gap-2 text-2xl mt-10 leading-none max-md:mt-[2rem]">
            <Link to="/login" className="text-indigo-400">Get Started</Link>
            <img
              loading="lazy"
              srcSet="https://cdn.builder.io/api/v1/image/assets/TEMP/d22153d2fedae1d17dbc0e57bc87380407d5cf9a15c9d2f92c696fb45e1b3918?apiKey=1d485f9dde7143abb922c2dffce25120&width=100 100w, https://cdn.builder.io/api/v1/image/assets/TEMP/d22153d2fedae1d17dbc0e57bc87380407d5cf9a15c9d2f92c696fb45e1b3918?apiKey=1d485f9dde7143abb922c2dffce25120&width=200 200w, https://cdn.builder.io/api/v1/image/assets/TEMP/d22153d2fedae1d17dbc0e57bc87380407d5cf9a15c9d2f92c696fb45e1b3918?apiKey=1d485f9dde7143abb922c2dffce25120&width=400 400w, https://cdn.builder.io/api/v1/image/assets/TEMP/d22153d2fedae1d17dbc0e57bc87380407d5cf9a15c9d2f92c696fb45e1b3918?apiKey=1d485f9dde7143abb922c2dffce25120&width=800 800w, https://cdn.builder.io/api/v1/image/assets/TEMP/d22153d2fedae1d17dbc0e57bc87380407d5cf9a15c9d2f92c696fb45e1b3918?apiKey=1d485f9dde7143abb922c2dffce25120&width=1200 1200w, https://cdn.builder.io/api/v1/image/assets/TEMP/d22153d2fedae1d17dbc0e57bc87380407d5cf9a15c9d2f92c696fb45e1b3918?apiKey=1d485f9dde7143abb922c2dffce25120&width=1600 1600w, https://cdn.builder.io/api/v1/image/assets/TEMP/d22153d2fedae1d17dbc0e57bc87380407d5cf9a15c9d2f92c696fb45e1b3918?apiKey=1d485f9dde7143abb922c2dffce25120&width=2000 2000w, https://cdn.builder.io/api/v1/image/assets/TEMP/d22153d2fedae1d17dbc0e57bc87380407d5cf9a15c9d2f92c696fb45e1b3918?apiKey=1d485f9dde7143abb922c2dffce25120&"
              className="object-contain shrink-0 my-auto w-4 bg-blend-normal aspect-[1.14]"
            />
          </div>
        </div>
      </div>
      <div className="flex mt-24 max-w-full bg-blend-normal bg-neutral-100 bg-opacity-10 min-h-[1px] w-full md:w-[768px] lg:w-[896px] max-md:mt-[2rem]" />
    </div>
  );
}
