import { FlowEditor } from "./ui";
import "./index.css";

// Import registry to ensure functions are registered
import "./registry";

function App() {
  return (
    <div className="h-screen w-screen">
      <FlowEditor
        onSave={(workflow) => {
          console.log("Workflow saved:", workflow);
        }}
      />
    </div>
  );
}

export default App;
