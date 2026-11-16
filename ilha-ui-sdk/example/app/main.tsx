// Demo over every tranche-1 component.
import { mount } from "ilha";

import { Button } from "../../src/button.tsx";
import { Checkbox, CheckboxGroup } from "../../src/checkbox.tsx";
import { Label } from "../../src/label.tsx";
import { Meter } from "../../src/meter.tsx";
import { Progress } from "../../src/progress.tsx";
import { Separator } from "../../src/separator.tsx";
import { Switch } from "../../src/switch.tsx";
import { Tabs, TabsList, TabsPanel, TabsTab } from "../../src/tabs.tsx";
import { Toggle, ToggleGroup } from "../../src/toggle.tsx";

function App() {
  return (
    <main>
      <h1>ilha-ui-sdk demo</h1>
      <section>
        <h2>Button</h2>
        <Button onclick={() => alert("pressed")}>Press me</Button>
      </section>
      <section>
        <h2>Checkbox</h2>
        <CheckboxGroup defaultValue={["a"]}>
          <Checkbox value="a">Alpha</Checkbox>
          <Checkbox value="b">Beta</Checkbox>
        </CheckboxGroup>
      </section>
      <section>
        <h2>Switch</h2>
        <Label>
          <Switch defaultChecked /> Wifi
        </Label>
      </section>
      <section>
        <h2>Toggle</h2>
        <ToggleGroup defaultValue={["bold"]}>
          <Toggle value="bold">Bold</Toggle>
          <Toggle value="italic">Italic</Toggle>
        </ToggleGroup>
      </section>
      <section>
        <h2>Tabs</h2>
        <Tabs defaultValue="one">
          <TabsList>
            <TabsTab value="one">One</TabsTab>
            <TabsTab value="two">Two</TabsTab>
          </TabsList>
          <TabsPanel value="one">First panel</TabsPanel>
          <TabsPanel value="two">Second panel</TabsPanel>
        </Tabs>
      </section>
      <Separator />
      <section>
        <h2>Meter and Progress</h2>
        <Meter value={0.4} />
        <Progress value={40} />
      </section>
    </main>
  );
}

mount(document.getElementById("app")!, App);
