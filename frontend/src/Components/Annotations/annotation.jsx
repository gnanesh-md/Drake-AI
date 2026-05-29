import React, { useState } from 'react';
import axios from 'axios';
import { NODE_API } from '../../config/constants';

const ProjectForm = () => {
  const [projectName, setProjectName] = useState('');
  const [images, setImages] = useState([]);
  const [project, setProject] = useState(null);

  const handleImageChange = (e) => {
    setImages(e.target.files);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const formData = new FormData();
    formData.append('name', projectName);
    Array.from(images).forEach((image) => formData.append('images', image));

    try {
      const response = await axios.post(NODE_API + '/api/projects', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setProject(response.data.project); // Update state with created project
    } catch (error) {
      console.error('Error uploading project:', error);
    }
  };

  return (
    <div>
      <h2>Create a New Project</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Project Name"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          required
        />
        <input type="file" multiple onChange={handleImageChange} />
        <button type="submit">Create Project</button>
      </form>

      {project && (
        <div>
          <h3>Project Created: {project.name}</h3>
          <div>
            {project.images.map((image, index) => (
              <img key={index} src={`${NODE_API}/uploads/${project._id}/images/${image}`} alt="project" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectForm;
