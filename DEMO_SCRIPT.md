# DEMO_SCRIPT.md: DCN V-Lab Demo Video Narration

**Experiment 4: IP Fragmentation and Reassembly**
Target length: **6 to 8 minutes**. Format: screen recording with voice-over, 1080p, MP4. Save as `assets/videos/demo.mp4`.

Use six speakers' names in the intro if the group wants every member credited. Lines in *italics* are stage directions and are not spoken. Numbers quoted below are what the lab shows for **Scenario 1** (D = 4000, MTU = 1500, H = 20, DF = 0). The Identification value is random on every run, so read it off the screen instead of memorising it.

---

## Before you record

* Open `index.html` in a clean browser window (zoom 100% to 110%, bookmarks bar hidden, notifications off).
* Switch the **Voice assistant** on in the sidebar and click **Start experiment** once, so the browser allows speech. Decide whether you want the lab's own voice audible in the recording (nice for the voice-assistant requirement) or muted under your narration.
* Clear any saved settings if you want a fresh start (browser site data for this page).
* Do one full dry run. Keep the mouse slow and deliberate, pausing 1 to 2 seconds on whatever you are talking about.

---

## Step 1: Introduction (about 40 s)

*Screen: Overview page. Slowly move the cursor over the Source, Router, Destination diagram.*

> "Hello, and welcome to the Virtual Laboratory for Experiment 4 of Data Communication and Networking: **IP Fragmentation and Reassembly**, at the Network Layer.
>
> Every network link has a Maximum Transmission Unit, or MTU, the largest packet it can carry. When an IPv4 datagram is bigger than the MTU of the next link, the router must either split it into fragments, or, if the Don't Fragment flag is set, drop it. Only the destination puts the pieces back together.
>
> In this lab you will set the datagram size and the MTU, watch the router fragment the packet, inspect every header field, and then rebuild the datagram at the destination, including what happens when a fragment goes missing."

*Click **Start experiment**. The lab's welcome line may play here.*

---

## Step 2: Set the packet size (about 40 s)

*Screen: Experiment setup. Drag the datagram size slider slowly, then settle on 4000.*

> "On the Experiment setup page, the first parameter is the **original datagram size**. I will use 4000 bytes. With the standard 20-byte IPv4 header, the live preview shows the original payload is **D minus H, which is 3980 bytes**.
>
> Notice the live validation: if I enter values that cannot work, the lab shows a clear error and blocks the simulation."

*Optional: briefly show the 24-byte header option and say:* "Header lengths of 24 and 28 mean IP options are present. In this lab we assume all options are copied into every fragment."
*Set header length back to 20 bytes. Leave DF = 0.*

---

## Step 3: Set the MTU (about 40 s)

*Screen: Same page. Drag the MTU slider, settle on 1500.*

> "The second parameter is the network **MTU**. I will use 1500 bytes, the standard Ethernet value.
>
> The maximum payload of a fragment is **Pmax equals floor of MTU minus H, divided by 8, times 8**. That gives floor of 1480 over 8, times 8, which is **1480 bytes**. It must be a multiple of 8, because the fragment offset field counts in 8-byte units.
>
> The preview already tells us the datagram is larger than the MTU, so **three fragments** are expected."

---

## Step 4: Perform fragmentation (about 1 min 15 s)

*Screen: Click **Simulate**. The simulation page opens and starts automatically. If it runs too fast, press Reset, set the speed slider to 0.5×, and press Start.*

> "I press **Simulate**. The source builds a 4000-byte datagram and sends it across Link A to the router.
>
> *(router check appears)* The router compares the size with the MTU: 4000 is greater than 1500, and DF is zero, so fragmentation is required.
>
> *(split animation)* The router splits the 3980-byte payload into **three colour-coded fragments**. Each gets its own IP header.
>
> Look at the calculation steps on the right. Fragment 1 carries 1480 bytes, offset 0. Fragment 2 carries 1480 bytes, offset 185, because 1480 divided by 8 is 185. Fragment 3 is the final fragment and carries the remaining **1020 bytes**, with offset 370 and the More Fragments flag set to **zero**.
>
> The fragments travel across Link B, and the destination counts them: received three of three."

*Use **Pause** and **Resume** once, and **Step** for a few stages, to show the controls.* "I can pause, step through each stage, change the speed, or reset at any time."

*Optional (20 s): load **Scenario 4**.* "If DF is set to one, the router cannot fragment. It drops the packet and returns **ICMP Type 3, Code 4, Fragmentation Needed**, carrying the next-hop MTU, so the sender can resend a smaller packet." *Then reload Scenario 1.*

---

## Step 5: Inspect the headers (about 1 min)

*Screen: Packet header inspector. Click **Fragment 2**.*

> "In the Packet Header Inspector I can pick the original datagram or any fragment. The header is drawn in 32-bit rows, with all the standard fields: version, header length, type of service, total length, identification, flags, fragment offset, time to live, protocol, header checksum, and the source and destination addresses.
>
> The purple fields are the ones fragmentation uses. **Identification** is the same in every fragment, here *(read the value)*, so the destination knows they belong together.
>
> *(click Flags)* In **Flags**, DF is zero and MF is one, meaning more fragments follow.
>
> *(click Fragment Offset)* **Fragment offset is 185**, meaning this payload starts at byte 185 times 8, which is 1480.
>
> *(click Header Checksum)* Each fragment has its **own checksum**. This is the real one's-complement checksum, and the lab confirms it verifies correctly. The router also decremented the time to live by one and recomputed the checksum."

*Click Fragment 3 to show MF = 0, and Fragment 1 to show offset 0.*

---

## Step 6: Perform reassembly (about 1 min 15 s)

*Screen: Reassembly laboratory. Click **Reset**. Set **Order** to **Shuffled**, then click **Receive next** three times (or **Receive all**).*

> "Now I act as the destination. Fragments can arrive in any order, so I will shuffle the arrival order.
>
> *(first fragment arrives)* Each fragment is placed using its offset, never in arrival order. The byte-range bar shows exactly which part of the original payload has arrived.
>
> *(if the last fragment arrives early)* Because the final fragment, with MF equal to zero, reveals the total length, it can tell the destination where the datagram ends.
>
> *(complete)* All three fragments have arrived out of order. **Out of order is not loss.** The status turns to Complete, no byte ranges are missing, and the original datagram is rebuilt: the lab confirms the payload is identical to the one the sender created."

*Show **Duplicate last**.* "If a fragment arrives twice, the duplicate is detected and ignored."

---

## Step 7: Show a missing fragment (about 1 min)

*Screen: Click **Reset**, set Order back to **In order**, tick **lose** on Fragment 2 (or load **Scenario 5** from the setup page). Click **Receive next** until the queue is empty.*

> "Now the realistic problem: fragment 2 is lost in the network.
>
> The destination receives fragments 1 and 3, but the status is **Partial**. The lab shows the **missing byte range: bytes 1480 to 2959**, which is 1480 bytes, exactly the payload of fragment 2.
>
> IP has no retransmission. The destination starts a **reassembly timer**, 15 seconds in this lab. *(click Advance clock to timeout)* When it expires with data still missing, the incomplete datagram is **discarded**. A real destination would also send an **ICMP Time Exceeded** message, type 11, code 1. A higher layer, such as TCP, must resend the whole datagram, which is why losing a single fragment is so costly."

*Click **Retry missing**, then **Receive all** to show a clean rebuild.*

---

## Step 8: Show the final result (about 50 s)

*Screen: Results and analysis.*

> "The Results page summarises the experiment. The table lists every fragment with its payload, total length, byte range, offset, MF, DF and checksum: 1500, 1500 and 1040 bytes in total length, offsets 0, 185 and 370, and MF of 1, 1 and 0.
>
> The verification panel checks every rule automatically: the payloads add up to 3980, every fragment fits within the MTU, offsets are contiguous, all fragments share the same Identification, and every checksum is valid.
>
> The conclusion is generated from the values we entered. I can press **Reset and repeat** to try different parameters, for example a smaller MTU of 600, which produces seven fragments."

*Briefly open the **Quiz**, answer one question to show the instant feedback and explanation, then show the **Video and references** page.*

> "The lab also includes a quiz with instant feedback, the full experiment documentation, references, and our team details. Thank you for watching."

---

## Checklist before submitting the video

- [ ] All 8 steps shown in order: introduction, packet size, MTU, fragmentation, header inspection, reassembly, missing fragment, final result
- [ ] Voice assistant shown at least once (narration or the explain buttons)
- [ ] Animations shown with Start, Pause, Step and Reset
- [ ] Audio is clear, no background noise, no private browser tabs visible
- [ ] File saved as `assets/videos/demo.mp4`, and `videoSrc` set in `index.html`
- [ ] Team names and roll numbers filled in on the Video and references page
